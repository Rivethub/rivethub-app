import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { sha256File } from "@rivethub/shared/sha256sums";

import { RhLock, rhLock, rhTargetFor } from "../src/rh/rhLock";
import { fetchRh, type Download } from "./fetch-rh";

const exec = promisify(execFile);
const TARGET = "x86_64-unknown-linux-gnu";
const ASSET = `rh-9.9.9-${TARGET}.tar.gz`;
const OTHER = "0".repeat(64);

let fixtures: string;
let archive: string;
let archiveSha: string;

async function makeArchive(name: string, members: Record<string, string>): Promise<string> {
  const src = path.join(fixtures, `${name}-src`);
  await mkdir(src, { recursive: true });
  for (const [member, body] of Object.entries(members)) {
    await writeFile(path.join(src, member), body);
    await chmod(path.join(src, member), 0o755);
  }
  const file = path.join(fixtures, name);
  await exec("tar", ["-czf", file, "-C", src, ...Object.keys(members)]);
  return file;
}

beforeAll(async () => {
  fixtures = await mkdtemp(path.join(tmpdir(), "fetch-rh-fixtures-"));
  archive = await makeArchive(ASSET, {
    rh: '#!/bin/sh\necho "RivetHub v9.9.9"\n',
    "rivethub-migrate": "#!/bin/sh\necho migrate\n",
    LICENSE: "license\n",
  });
  archiveSha = await sha256File(archive);
});
afterAll(() => rm(fixtures, { recursive: true, force: true }));

let work: string;
let cacheDir: string;
let stageDir: string;
beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "fetch-rh-"));
  cacheDir = path.join(work, "cache");
  stageDir = path.join(work, "prod-resources", "rh");
});
afterEach(() => rm(work, { recursive: true, force: true }));

function lockPinning(sha256: string): RhLock {
  return RhLock.parse({
    repository: "Rivethub/rivethub-runtime",
    version: "9.9.9",
    targets: {
      "x86_64-unknown-linux-gnu": { asset: ASSET, sha256 },
      "aarch64-unknown-linux-gnu": { asset: "rh-9.9.9-aarch64-unknown-linux-gnu.tar.gz", sha256: OTHER },
      "universal-apple-darwin": { asset: "rh-9.9.9-universal-apple-darwin.tar.gz", sha256: OTHER },
    },
  });
}

/** A release server in a map: file name → local file or SHA256SUMS text. Records every URL asked for. */
function fakeRelease(files: { archive?: string; sums: string }): Download & { urls: string[] } {
  const urls: string[] = [];
  const download = async (url: string, dest: string) => {
    urls.push(url);
    const name = url.slice(url.lastIndexOf("/") + 1);
    if (name === "SHA256SUMS") return writeFile(dest, files.sums);
    if (name === ASSET) return writeFile(dest, await readFile(files.archive ?? archive));
    throw new Error(`404 ${url}`);
  };
  return Object.assign(download, { urls });
}

const sumsLine = (sha: string, name = ASSET) => `${sha}  ${name}\n`;
const staged = (name: string) => path.join(stageDir, name);
const exists = (file: string) => access(file).then(() => true, () => false);

describe("fetchRh", () => {
  it("stages executable rh and rivethub-migrate from an archive matching the lock and SHA256SUMS", async () => {
    const release = fakeRelease({ sums: sumsLine(OTHER, "rh-9.9.9-aarch64-unknown-linux-gnu.tar.gz") + sumsLine(archiveSha) });
    await expect(fetchRh({ lock: lockPinning(archiveSha), target: TARGET, cacheDir, stageDir, download: release })).resolves.toEqual({ fromCache: false });

    expect(release.urls).toEqual([
      `https://github.com/Rivethub/rivethub-runtime/releases/download/v9.9.9/${ASSET}`,
      "https://github.com/Rivethub/rivethub-runtime/releases/download/v9.9.9/SHA256SUMS",
    ]);
    expect((await exec(staged("rh"), ["version"])).stdout).toBe("RivetHub v9.9.9\n");
    expect((await exec(staged("rivethub-migrate"))).stdout).toBe("migrate\n");
    expect(await exists(staged("LICENSE"))).toBe(false);
  });

  it("uses the cached archive without the network once it has been verified", async () => {
    await fetchRh({ lock: lockPinning(archiveSha), target: TARGET, cacheDir, stageDir, download: fakeRelease({ sums: sumsLine(archiveSha) }) });
    await rm(stageDir, { recursive: true });
    const offline = fakeRelease({ sums: "" });

    await expect(fetchRh({ lock: lockPinning(archiveSha), target: TARGET, cacheDir, stageDir, download: offline })).resolves.toEqual({ fromCache: true });
    expect(offline.urls).toEqual([]);
    expect(await exists(staged("rh"))).toBe(true);
  });

  it("downloads again when the cached archive was altered", async () => {
    await fetchRh({ lock: lockPinning(archiveSha), target: TARGET, cacheDir, stageDir, download: fakeRelease({ sums: sumsLine(archiveSha) }) });
    await writeFile(path.join(cacheDir, archiveSha, ASSET), "tampered");
    const release = fakeRelease({ sums: sumsLine(archiveSha) });

    await expect(fetchRh({ lock: lockPinning(archiveSha), target: TARGET, cacheDir, stageDir, download: release })).resolves.toEqual({ fromCache: false });
    expect(release.urls).toHaveLength(2);
  });

  it.each([
    ["the lock pins another digest", () => lockPinning(OTHER), () => sumsLine(archiveSha), /does not match rh\.lock\.json/],
    ["SHA256SUMS has no line for the archive", () => lockPinning(archiveSha), () => sumsLine(archiveSha, "rh-9.9.8-x86_64-unknown-linux-gnu.tar.gz"), /has no line for/],
    ["the lock and SHA256SUMS disagree", () => lockPinning(archiveSha), () => sumsLine(OTHER), /does not match the release's SHA256SUMS/],
    ["SHA256SUMS lists the archive twice", () => lockPinning(archiveSha), () => sumsLine(archiveSha) + sumsLine(archiveSha), /more than once/],
  ])("refuses to stage when %s", async (_case, lock, sums, error) => {
    await mkdir(stageDir, { recursive: true });
    await writeFile(staged("rh"), "previous build");

    await expect(fetchRh({ lock: lock(), target: TARGET, cacheDir, stageDir, download: fakeRelease({ sums: sums() }) })).rejects.toThrow(error);
    expect(await readFile(staged("rh"), "utf8")).toBe("previous build");
    expect(await exists(path.join(cacheDir, lock().targets[TARGET].sha256))).toBe(false);
  });

  it("refuses an archive without rivethub-migrate", async () => {
    const partial = await makeArchive("partial.tar.gz", { rh: "#!/bin/sh\n" });
    const sha = await sha256File(partial);

    await expect(
      fetchRh({ lock: lockPinning(sha), target: TARGET, cacheDir, stageDir, download: fakeRelease({ archive: partial, sums: sumsLine(sha) }) }),
    ).rejects.toThrow(/one rivethub-migrate at its top level, found 0/);
    expect(await exists(stageDir)).toBe(false);
  });
});

describe("rh.lock.json", () => {
  it("rejects an asset name that does not match its version and target", () => {
    const lock = structuredClone(rhLock);
    lock.targets["universal-apple-darwin"].asset = "rh-0.7.0-universal-apple-darwin.tar.gz";
    expect(() => RhLock.parse(lock)).toThrow(/expected rh-0\.8\.0-universal-apple-darwin\.tar\.gz/);
  });

  it("maps hosts to the archive that runs there", () => {
    expect(rhTargetFor("linux", "x64")).toBe("x86_64-unknown-linux-gnu");
    expect(rhTargetFor("linux", "arm64")).toBe("aarch64-unknown-linux-gnu");
    expect(rhTargetFor("darwin", "x64")).toBe("universal-apple-darwin");
    expect(rhTargetFor("darwin", "arm64")).toBe("universal-apple-darwin");
    expect(rhTargetFor("win32", "x64")).toBeNull();
  });
});

describe.runIf(process.env["RIVETHUB_FETCH_RH_LIVE"] === "1" && rhTargetFor(process.platform, process.arch) === TARGET)("live release", () => {
  it(`stages the pinned rh ${rhLock.version} for ${TARGET}`, { timeout: 300_000 }, async () => {
    await fetchRh({ lock: rhLock, target: TARGET, cacheDir, stageDir });
    expect((await exec(staged("rh"), ["version"])).stdout).toContain(`RivetHub v${rhLock.version}`);
  });
});
