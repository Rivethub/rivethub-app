import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type IncomingMessage, type RequestListener, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

/** Members are files at mode 0755, or `{ symlink: target }`. */
async function makeArchive(name: string, members: Record<string, string | { symlink: string }>): Promise<string> {
  const src = path.join(fixtures, `${name}-src`);
  await mkdir(src, { recursive: true });
  for (const [member, body] of Object.entries(members)) {
    if (typeof body !== "string") {
      await symlink(body.symlink, path.join(src, member));
      continue;
    }
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
const modeOf = async (file: string) => (await stat(file)).mode & 0o777;

describe("fetchRh", () => {
  it("stages executable rh and rivethub-migrate, and rh's LICENSE, from an archive matching the lock and SHA256SUMS", async () => {
    const release = fakeRelease({ sums: sumsLine(OTHER, "rh-9.9.9-aarch64-unknown-linux-gnu.tar.gz") + sumsLine(archiveSha) });
    await expect(fetchRh({ lock: lockPinning(archiveSha), target: TARGET, cacheDir, stageDir, download: release })).resolves.toEqual({ fromCache: false });

    expect(release.urls).toEqual([
      `https://github.com/Rivethub/rivethub-runtime/releases/download/v9.9.9/${ASSET}`,
      "https://github.com/Rivethub/rivethub-runtime/releases/download/v9.9.9/SHA256SUMS",
    ]);
    expect((await exec(staged("rh"), ["version"])).stdout).toBe("RivetHub v9.9.9\n");
    expect((await exec(staged("rivethub-migrate"))).stdout).toBe("migrate\n");
    expect(await readFile(staged("LICENSE"), "utf8")).toBe("license\n");
    expect(await readdir(stageDir)).toEqual(["LICENSE", "rh", "rivethub-migrate"]);
  });

  it("makes the stage readable by everyone: the directory and binaries 0755, LICENSE 0644", async () => {
    await fetchRh({ lock: lockPinning(archiveSha), target: TARGET, cacheDir, stageDir, download: fakeRelease({ sums: sumsLine(archiveSha) }) });

    expect(await modeOf(stageDir)).toBe(0o755);
    expect(await modeOf(staged("rh"))).toBe(0o755);
    expect(await modeOf(staged("rivethub-migrate"))).toBe(0o755);
    expect(await modeOf(staged("LICENSE"))).toBe(0o644);
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

  it.each(["rivethub-migrate", "LICENSE"])("refuses an archive without %s", async (missing) => {
    const members = { rh: "#!/bin/sh\n", "rivethub-migrate": "#!/bin/sh\n", LICENSE: "license\n" };
    delete members[missing as keyof typeof members];
    const partial = await makeArchive(`without-${missing}.tar.gz`, members);
    const sha = await sha256File(partial);

    await expect(
      fetchRh({ lock: lockPinning(sha), target: TARGET, cacheDir, stageDir, download: fakeRelease({ archive: partial, sums: sumsLine(sha) }) }),
    ).rejects.toThrow(`one ${missing} at its top level, found 0`);
    expect(await exists(stageDir)).toBe(false);
  });

  it("refuses an archive whose rh is a symlink", async () => {
    const linked = await makeArchive("symlink.tar.gz", { rh: { symlink: "/bin/sh" }, "rivethub-migrate": "#!/bin/sh\n", LICENSE: "license\n" });
    const sha = await sha256File(linked);

    await expect(
      fetchRh({ lock: lockPinning(sha), target: TARGET, cacheDir, stageDir, download: fakeRelease({ archive: linked, sums: sumsLine(sha) }) }),
    ).rejects.toThrow(`rh in ${ASSET} is not a regular file`);
    expect(await exists(stageDir)).toBe(false);
  });

  it("stages only rh's own bytes when the archive also holds rh/evil", async () => {
    const rhSrc = path.join(fixtures, "joined-rh-src");
    const evilSrc = path.join(fixtures, "joined-evil-src");
    await mkdir(rhSrc, { recursive: true });
    await mkdir(path.join(evilSrc, "rh"), { recursive: true });
    await writeFile(path.join(rhSrc, "rh"), "#!/bin/sh\necho rh\n");
    await writeFile(path.join(rhSrc, "rivethub-migrate"), "#!/bin/sh\n");
    await writeFile(path.join(rhSrc, "LICENSE"), "license\n");
    await writeFile(path.join(evilSrc, "rh", "evil"), "echo evil\n");
    const joined = path.join(fixtures, "joined.tar.gz");
    await exec("tar", ["-czf", joined, "-C", rhSrc, "rh", "rivethub-migrate", "LICENSE", "-C", evilSrc, "rh/evil"]);
    const sha = await sha256File(joined);

    await fetchRh({ lock: lockPinning(sha), target: TARGET, cacheDir, stageDir, download: fakeRelease({ archive: joined, sums: sumsLine(sha) }) });
    expect(await readFile(staged("rh"), "utf8")).toBe("#!/bin/sh\necho rh\n");
    expect(await readdir(stageDir)).toEqual(["LICENSE", "rh", "rivethub-migrate"]);
  });

  it("refuses a file in the archive over the size limit and keeps the previous stage", async () => {
    await mkdir(stageDir, { recursive: true });
    await writeFile(staged("rh"), "previous build");
    const big = await makeArchive("big.tar.gz", { rh: "x".repeat(4096), "rivethub-migrate": "#!/bin/sh\n", LICENSE: "license\n" });
    const sha = await sha256File(big);

    await expect(
      fetchRh({ lock: lockPinning(sha), target: TARGET, cacheDir, stageDir, maxFileBytes: 1024, download: fakeRelease({ archive: big, sums: sumsLine(sha) }) }),
    ).rejects.toThrow(`rh in ${ASSET}: over the 1024-byte limit`);
    expect(await readFile(staged("rh"), "utf8")).toBe("previous build");
    expect(await readdir(path.dirname(stageDir))).toEqual(["rh"]);
  });
});

describe("httpDownload", () => {
  let certFile: string;
  let https: Server;
  let http: Server;
  const httpHits: string[] = [];
  const origin = (server: Server, scheme: string) => `${scheme}://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const routes = new Map<string, RequestListener>([
    ["/asset", (_req, res) => res.end("payload")],
    ["/hop", (_req, res) => res.writeHead(302, { location: "/asset" }).end()],
    ["/downgrade", (_req, res) => res.writeHead(302, { location: `${origin(http, "http")}/asset` }).end()],
    ["/loop", (_req, res) => res.writeHead(302, { location: "/loop" }).end()],
    // Says 1000 bytes, sends 5, then stalls: only a check on Content-Length can stop it.
    ["/declared-large", (_req, res) => res.writeHead(200, { "content-length": 1000 }).write("12345")],
    // No Content-Length, sends 12 bytes, then stalls: only a check while streaming can stop it.
    ["/streamed-large", (_req, res) => {
      res.writeHead(200).write("123456");
      setTimeout(() => res.write("789012"), 50);
    }],
  ]);

  /** Only names registered above run. `Map#get` does not see `Object.prototype`. */
  function dispatch(url: string, req: IncomingMessage, res: ServerResponse) {
    const route = routes.get(url);
    if (route) route(req, res);
    else res.writeHead(404).end();
  }

  const listen = async (server: Server) => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return server;
  };

  beforeAll(async () => {
    const keyFile = path.join(fixtures, "key.pem");
    certFile = path.join(fixtures, "cert.pem");
    await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
      "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", keyFile, "-out", certFile]);
    https = await listen(
      createHttpsServer({ key: await readFile(keyFile), cert: await readFile(certFile) }, (req, res) => {
        dispatch(req.url ?? "", req, res);
      }),
    );
    http = await listen(
      createHttpServer((req, res) => {
        httpHits.push(req.url ?? "");
        res.end("payload over http");
      }),
    );
  });
  afterAll(() => {
    for (const server of [https, http]) server.closeAllConnections();
    return Promise.all([https, http].map((server) => new Promise((resolve) => server.close(resolve))));
  });
  beforeEach(() => {
    httpHits.length = 0;
  });

  const fetchRhModule = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "fetch-rh.ts")).href;
  const runner = `import { httpDownload } from ${JSON.stringify(fetchRhModule)};
const { url, dest, maxBytes } = JSON.parse(process.env.DOWNLOAD);
await httpDownload(url, dest, maxBytes);`;

  /** Runs httpDownload in a node that trusts the fixture certificate; resolves to what it wrote, or its error. */
  async function download(url: string, maxBytes?: number): Promise<{ body: string } | { error: string }> {
    const dest = path.join(work, "download");
    const env = { ...process.env, NODE_EXTRA_CA_CERTS: certFile, DOWNLOAD: JSON.stringify({ url, dest, maxBytes }) };
    try {
      await exec(process.execPath, ["--input-type=module", "-e", runner], { env, timeout: 4_000 });
      return { body: await readFile(dest, "utf8") };
    } catch (error) {
      const { stderr, killed } = error as { stderr: string; killed: boolean };
      return { error: killed ? "timed out" : stderr };
    }
  }

  it("follows a redirect that stays on https", async () => {
    expect(await download(`${origin(https, "https")}/hop`)).toEqual({ body: "payload" });
  });

  it("refuses a redirect from https to http without requesting it", async () => {
    expect(await download(`${origin(https, "https")}/downgrade`)).toEqual({ error: expect.stringMatching(/refusing http:.*downloads stay on https/) });
    expect(httpHits).toEqual([]);
  });

  it("refuses an http URL", async () => {
    expect(await download(`${origin(http, "http")}/asset`)).toEqual({ error: expect.stringMatching(/downloads stay on https/) });
    expect(httpHits).toEqual([]);
  });

  it("gives up after five redirects", async () => {
    expect(await download(`${origin(https, "https")}/loop`)).toEqual({ error: expect.stringMatching(/more than 5 redirects/) });
  });

  it("refuses a Content-Length over the limit before reading the body", async () => {
    expect(await download(`${origin(https, "https")}/declared-large`, 10)).toEqual({ error: expect.stringMatching(/1000 bytes is over the 10-byte limit/) });
  });

  it("stops reading once the body passes the limit", async () => {
    expect(await download(`${origin(https, "https")}/streamed-large`, 10)).toEqual({ error: expect.stringMatching(/over the 10-byte limit/) });
  });

  it("answers 404 when the path is an inherited object method", () => {
    const statuses: number[] = [];
    const res = {
      writeHead(status: number) {
        statuses.push(status);
        return res;
      },
      end() {
        return res;
      },
    } as unknown as ServerResponse;
    for (const name of ["toString", "constructor", "hasOwnProperty", "valueOf", "__proto__"]) {
      expect(() => dispatch(name, {} as IncomingMessage, res), name).not.toThrow();
    }
    expect(statuses).toEqual([404, 404, 404, 404, 404]);
  });
});

describe("rh.lock.json", () => {
  it("rejects an asset name that does not match its version and target", () => {
    const lock = structuredClone(rhLock);
    lock.targets["universal-apple-darwin"].asset = "rh-0.7.0-universal-apple-darwin.tar.gz";
    expect(() => RhLock.parse(lock)).toThrow(/expected rh-0\.8\.3-universal-apple-darwin\.tar\.gz/);
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
    expect(await readFile(staged("LICENSE"), "utf8")).toContain("Apache License");
  });
});
