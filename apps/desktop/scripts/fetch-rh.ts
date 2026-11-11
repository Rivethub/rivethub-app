// pnpm --filter @rivethub/desktop fetch-rh [--target <triple>] [--cache-dir <dir>]
// Downloads the rh archive pinned in rh.lock.json, checks it against the lock and the
// release's SHA256SUMS, and stages rh and rivethub-migrate in prod-resources/rh for
// electron-builder's extraResources.
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import { verifySha256Sums } from "@rivethub/shared/sha256sums";

import { isRhTarget, rhLock, rhTargetFor, type RhLock, type RhTarget } from "../src/rh/rhLock.ts";

const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const STAGE_DIR = path.join(desktopDir, "prod-resources", "rh");
export const STAGED_BINARIES = ["rh", "rivethub-migrate"] as const;
const SUMS = "SHA256SUMS";

export type Download = (url: string, dest: string) => Promise<void>;

export interface FetchRhOptions {
  lock: RhLock;
  target: RhTarget;
  /** Verified downloads live in `<cacheDir>/<sha256>/`, next to the SHA256SUMS they were checked against. */
  cacheDir: string;
  stageDir: string;
  download?: Download;
}

export async function fetchRh({ lock, target, cacheDir, stageDir, download = httpDownload }: FetchRhOptions): Promise<{ fromCache: boolean }> {
  const { asset, sha256 } = lock.targets[target];
  const entry = path.join(cacheDir, sha256);
  const fromCache = await verify(entry, asset, sha256).then(
    () => true,
    () => false,
  );
  if (!fromCache) {
    await rm(entry, { recursive: true, force: true });
    await mkdir(cacheDir, { recursive: true });
    const tmp = await mkdtemp(path.join(cacheDir, ".download-"));
    try {
      const release = `https://github.com/${lock.repository}/releases/download/v${lock.version}`;
      await download(`${release}/${asset}`, path.join(tmp, asset));
      await download(`${release}/${SUMS}`, path.join(tmp, SUMS));
      await verify(tmp, asset, sha256);
      await rename(tmp, entry);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  await stage(path.join(entry, asset), stageDir);
  return { fromCache };
}

/** The archive must match both the lock's digest and its line in the release's SHA256SUMS. */
async function verify(dir: string, asset: string, pinned: string): Promise<void> {
  const checked = await verifySha256Sums(path.join(dir, asset), await readFile(path.join(dir, SUMS), "utf8"), asset);
  if (!checked.ok && checked.reason === "not-listed") throw new Error(`the release's ${SUMS} has no line for ${asset}`);
  if (!checked.ok) throw new Error(`${asset} does not match the release's ${SUMS}: listed ${checked.expected}, got ${checked.actual}`);
  if (checked.sha256 !== pinned) throw new Error(`${asset} does not match rh.lock.json: pinned ${pinned}, got ${checked.sha256}`);
}

async function stage(archive: string, stageDir: string): Promise<void> {
  const members = (await run("tar", ["-tzf", archive])).split("\n");
  const picks = STAGED_BINARIES.map((name) => {
    const found = members.filter((member) => member === name || member === `./${name}`);
    if (found.length !== 1) throw new Error(`${path.basename(archive)} should hold one ${name} at its top level, found ${found.length}`);
    return found[0]!;
  });
  await mkdir(path.dirname(stageDir), { recursive: true });
  const tmp = await mkdtemp(`${stageDir}.tmp-`);
  try {
    await run("tar", ["-xzf", archive, "-C", tmp, ...picks]);
    for (const name of STAGED_BINARIES) {
      if (!(await lstat(path.join(tmp, name))).isFile()) throw new Error(`${name} in ${path.basename(archive)} is not a regular file`);
      await chmod(path.join(tmp, name), 0o755);
    }
    await rm(stageDir, { recursive: true, force: true });
    await rename(tmp, stageDir);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function run(command: string, args: string[]): Promise<string> {
  return (await promisify(execFile)(command, args, { maxBuffer: 1 << 20 })).stdout;
}

const httpDownload: Download = async (url, dest) => {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`GET ${url}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(dest, { flags: "wx" }));
};

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { target: { type: "string" }, "cache-dir": { type: "string" } } });
  const target = values.target ?? rhTargetFor(process.platform, process.arch);
  if (target === null || !isRhTarget(target)) throw new Error(`no rh build for ${values.target ?? `${process.platform}-${process.arch}`}; pass --target`);
  const cacheDir = values["cache-dir"] ?? path.join(process.env["XDG_CACHE_HOME"] ?? path.join(homedir(), ".cache"), "rivethub", "rh");
  const { fromCache } = await fetchRh({ lock: rhLock, target, cacheDir, stageDir: STAGE_DIR });
  console.log(`rh ${rhLock.version} (${target}) staged in ${path.relative(process.cwd(), STAGE_DIR) || "."}${fromCache ? " from cache" : ""}`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`fetch-rh: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
