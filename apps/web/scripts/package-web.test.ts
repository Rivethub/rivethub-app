import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";

import { type PackageWebRequest, type WebChannel, PackageWebError, nightlyTagsToPrune, packageWebRelease, readWebPackage } from "./package-web";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("./package-web.ts", import.meta.url));
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const roots: string[] = [];
afterAll(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

async function stage(): Promise<{ dist: string; output: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "web-release-"));
  roots.push(root);
  const dist = path.join(root, "dist");
  await mkdir(path.join(dist, "assets"), { recursive: true });
  await writeFile(path.join(dist, "index.html"), "<!doctype html><head><meta name=\"rivethub-web-version\" content=\"0.0.0\" /><title>RivetHub</title></head>\n");
  await writeFile(path.join(dist, "assets", "app.js"), "console.log(1)\n");
  return { dist, output: path.join(root, "out") };
}

function request(dist: string, output: string, version: string, channel: WebChannel, extra: Partial<PackageWebRequest> = {}): PackageWebRequest {
  const base = version.split("-")[0] ?? version;
  return {
    distDir: dist,
    outputDir: output,
    version,
    channel,
    commit: COMMIT,
    packageVersion: base,
    minRhVersion: "0.8.3",
    ...extra,
    ...(channel === "nightly" ? {} : { tag: extra.tag ?? `web-v${version}` }),
  };
}

describe("packageWebRelease", () => {
  it("writes a stable archive with index.html at the root and a manifest whose digest matches", async () => {
    const { dist, output } = await stage();
    const result = await packageWebRelease(request(dist, output, "0.8.2", "stable"));
    const archived = await readFile(result.archivePath);
    expect(createHash("sha256").update(archived).digest("hex")).toBe(result.manifest.sha256);
    expect(result.manifest).toEqual({
      schemaVersion: 1,
      version: "0.8.2",
      commit: COMMIT,
      channel: "stable",
      minRhVersion: "0.8.3",
      asset: "rivethub-web-0.8.2.tar.gz",
      sha256: result.manifest.sha256,
    });
    expect(Object.keys(result.manifest)).toEqual(["schemaVersion", "version", "commit", "channel", "minRhVersion", "asset", "sha256"]);
    expect(archived.readUInt32LE(4)).toBe(0);

    const listed = (await exec("tar", ["-tzf", result.archivePath])).stdout.trim().split("\n");
    expect(listed).toEqual(["assets/", "assets/app.js", "index.html", "version.json"]);
    const names = tarNames(gunzipSync(archived));
    expect(names.map((member) => member.name)).toEqual(["assets/", "assets/app.js", "index.html", "version.json"]);
    expect(names.every((member) => member.mtime === 0 && member.uid === 0 && member.gid === 0)).toBe(true);
    expect(names.find((member) => member.name === "index.html")?.mode).toBe(0o644);
    expect(names.find((member) => member.name === "assets/")?.mode).toBe(0o755);
  });

  it("stamps the published version and commit into index.html and version.json", async () => {
    const { dist, output } = await stage();
    const version = "0.8.2-nightly.20261119.4";
    const result = await packageWebRelease(request(dist, output, version, "nightly"));
    const html = (await exec("tar", ["-xOf", result.archivePath, "index.html"])).stdout;
    const json = (await exec("tar", ["-xOf", result.archivePath, "version.json"])).stdout;
    expect(html).toContain(`<meta name="rivethub-web-version" content="${version}" />`);
    expect(html).toContain(`<meta name="rivethub-web-commit" content="${COMMIT}" />`);
    expect(html).not.toContain('content="0.0.0"');
    expect(JSON.parse(json)).toEqual({ version, commit: COMMIT });
  });

  it("packages the same dist to the same bytes", async () => {
    const { dist, output } = await stage();
    const first = await packageWebRelease(request(dist, output, "0.8.2", "stable"));
    const second = await packageWebRelease(request(dist, path.join(output, "again"), "0.8.2", "stable"));
    expect(await readFile(first.archivePath)).toEqual(await readFile(second.archivePath));
    expect(first.manifest.sha256).toBe(second.manifest.sha256);
  });

  it("accepts a beta tag that extends the package version", async () => {
    const { dist, output } = await stage();
    const result = await packageWebRelease(request(dist, output, "0.8.2-beta.1", "beta"));
    expect(result.manifest.channel).toBe("beta");
    expect(result.manifest.asset).toBe("rivethub-web-0.8.2-beta.1.tar.gz");
  });

  it("accepts a nightly version without a tag, including a leap day", async () => {
    const { dist, output } = await stage();
    const result = await packageWebRelease(request(dist, output, "0.8.2-nightly.20280229.3", "nightly"));
    expect(result.manifest.channel).toBe("nightly");
    expect(result.manifest.version).toBe("0.8.2-nightly.20280229.3");
  });

  it("keeps a long path through tar", async () => {
    const { dist, output } = await stage();
    const longName = `${"a".repeat(120)}.js`;
    await writeFile(path.join(dist, "assets", longName), "long\n");
    const result = await packageWebRelease(request(dist, output, "0.8.2", "stable"));
    const listed = (await exec("tar", ["-tzf", result.archivePath])).stdout.trim().split("\n");
    expect(listed).toContain(`assets/${longName}`);
  });

  it("refuses a dist without index.html", async () => {
    const { dist, output } = await stage();
    await rm(path.join(dist, "index.html"));
    await expect(packageWebRelease(request(dist, output, "0.8.2", "stable"))).rejects.toThrow(/index\.html/);
  });

  it("refuses a link", async () => {
    const { dist, output } = await stage();
    await symlink("index.html", path.join(dist, "alias.html"));
    await expect(packageWebRelease(request(dist, output, "0.8.2", "stable"))).rejects.toThrow(/link/);
  });

  it("refuses an output directory inside dist", async () => {
    const { dist } = await stage();
    await expect(packageWebRelease(request(dist, path.join(dist, "out"), "0.8.2", "stable"))).rejects.toThrow(/inside dist/);
  });

  it.each([
    "1.2",
    "01.2.3",
    "1.2.3+build",
    "1.2.3-beta",
    "1.2.3-beta.01",
    "1.2.3-rc.1",
    "1.2.3-nightly.20261117",
    "1.2.3-nightly.20260231.1",
    "1.2.3-nightly.20260229.1",
  ])("refuses %s", async (version) => {
    const { dist, output } = await stage();
    await expect(packageWebRelease(request(dist, output, version, "stable", { packageVersion: "1.2.3", tag: `web-v${version}` }))).rejects.toThrow(PackageWebError);
  });

  it("refuses a stable tag that is not the package version", async () => {
    const { dist, output } = await stage();
    await expect(packageWebRelease(request(dist, output, "0.8.2", "stable", { tag: "web-v0.8.3" }))).rejects.toThrow(/tag/);
    await expect(packageWebRelease(request(dist, output, "0.8.3", "stable", { packageVersion: "0.8.2", tag: "web-v0.8.3" }))).rejects.toThrow(/package version/);
  });

  it("refuses a beta tag whose base is not the package version", async () => {
    const { dist, output } = await stage();
    await expect(packageWebRelease(request(dist, output, "0.8.2-beta.1", "beta", { tag: "web-v0.8.2" }))).rejects.toThrow(/tag/);
    await expect(packageWebRelease(request(dist, output, "0.9.0-beta.1", "beta", { packageVersion: "0.8.2", tag: "web-v0.9.0-beta.1" }))).rejects.toThrow(/package version/);
  });

  it("refuses a nightly whose base is not the package version", async () => {
    const { dist, output } = await stage();
    await expect(packageWebRelease(request(dist, output, "0.9.0-nightly.20261117.1", "nightly", { packageVersion: "0.8.2" }))).rejects.toThrow(/package version/);
  });

  it("refuses a channel that disagrees with the version", async () => {
    const { dist, output } = await stage();
    await expect(packageWebRelease(request(dist, output, "0.8.2", "nightly", { tag: "web-v0.8.2" }))).rejects.toThrow(/channel/);
  });

  it("refuses a stable release with no tag", async () => {
    const { dist, output } = await stage();
    const { tag: _tag, ...withoutTag } = request(dist, output, "0.8.2", "stable");
    await expect(packageWebRelease(withoutTag)).rejects.toThrow(/tag/);
  });
});

describe("readWebPackage", () => {
  it("reads the version and minimum rh this repo declares", async () => {
    const declared = await readWebPackage(fileURLToPath(new URL("../package.json", import.meta.url)));
    expect(declared.version).toBe("0.8.2");
    expect(declared.minRhVersion).toBe("0.8.3");
  });

  it("refuses a package with no minimum", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "web-pkg-"));
    roots.push(root);
    const file = path.join(root, "package.json");
    await writeFile(file, `${JSON.stringify({ version: "0.8.2" })}\n`);
    await expect(readWebPackage(file)).rejects.toThrow(/minRhVersion/);
  });
});

describe("nightlyTagsToPrune", () => {
  const tags = Array.from({ length: 12 }, (_, index) => `web-v0.8.2-nightly.20261117.${index + 1}`);

  it("drops the oldest nightlies past the keep count", () => {
    expect(nightlyTagsToPrune(tags, 10)).toEqual(["web-v0.8.2-nightly.20261117.2", "web-v0.8.2-nightly.20261117.1"]);
  });

  it("ranks a higher package version ahead of a later date", () => {
    const mixed = ["web-v0.8.2-nightly.20261118.1", "web-v0.9.0-nightly.20261101.1", ...tags.slice(0, 9)];
    expect(nightlyTagsToPrune(mixed, 10)).toEqual(["web-v0.8.2-nightly.20261117.1"]);
  });

  it("leaves a protected tag and ignores tags that are not nightlies", () => {
    const extra = ["web-v0.8.2", "web-v0.8.2-beta.1", "not-a-release", ...tags];
    expect(nightlyTagsToPrune(extra, 10, "web-v0.8.2-nightly.20261117.1")).toEqual(["web-v0.8.2-nightly.20261117.2"]);
    expect(nightlyTagsToPrune(tags.slice(0, 3), 10)).toEqual([]);
  });
});

describe("cli", () => {
  it("packages from argv and checks the tag against package.json", async () => {
    const { dist, output } = await stage();
    const declared = await readWebPackage(fileURLToPath(new URL("../package.json", import.meta.url)));
    const { stdout } = await exec(process.execPath, [
      script,
      "--dist",
      dist,
      "--output-dir",
      output,
      "--version",
      declared.version,
      "--channel",
      "stable",
      "--commit",
      COMMIT,
      "--tag",
      `web-v${declared.version}`,
      "--dry-run",
    ]);
    expect(stdout).toContain("dry run");
    const manifest = JSON.parse(await readFile(path.join(output, "web-manifest.json"), "utf8")) as { version: string; sha256: string; asset: string };
    expect(manifest.version).toBe(declared.version);
    const digest = createHash("sha256").update(await readFile(path.join(output, manifest.asset))).digest("hex");
    expect(digest).toBe(manifest.sha256);
  });

  it("exits non-zero when the tag does not match", async () => {
    const { dist, output } = await stage();
    const result = await exec(process.execPath, [script, "--dist", dist, "--output-dir", output, "--version", "0.8.2", "--commit", COMMIT, "--tag", "web-v9.9.9"]).then(
      () => ({ code: 0, stderr: "" }),
      (error: { code?: number; stderr?: string }) => ({ code: error.code ?? 1, stderr: error.stderr ?? "" }),
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/tag/);
  });
});

function tarNames(tar: Buffer): { name: string; mode: number; uid: number; gid: number; mtime: number }[] {
  const members: { name: string; mode: number; uid: number; gid: number; mtime: number }[] = [];
  let offset = 0;
  let pending: string | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const type = String.fromCharCode(header[156] ?? 0);
    const size = parseOctal(header.subarray(124, 136));
    const name = cString(header.subarray(0, 100));
    const prefix = cString(header.subarray(345, 500));
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      pending = paxPath(tar.subarray(offset - Math.ceil(size / 512) * 512, offset - Math.ceil(size / 512) * 512 + size));
      continue;
    }
    if (type !== "0" && type !== "5") continue;
    members.push({
      name: pending ?? (prefix === "" ? name : `${prefix}/${name}`),
      mode: parseOctal(header.subarray(100, 108)),
      uid: parseOctal(header.subarray(108, 116)),
      gid: parseOctal(header.subarray(116, 124)),
      mtime: parseOctal(header.subarray(136, 148)),
    });
    pending = undefined;
  }
  return members;
}

function cString(bytes: Buffer): string {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString("utf8");
}

function parseOctal(bytes: Buffer): number {
  return Number.parseInt(cString(bytes).trim(), 8);
}

function paxPath(body: Buffer): string {
  const text = body.toString("utf8");
  const match = / path=([^\n]+)\n/.exec(text);
  if (match?.[1] === undefined) throw new Error("pax header has no path");
  return match[1];
}
