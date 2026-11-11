// pnpm --filter @rivethub/desktop fetch-rh [--target <triple>] [--cache-dir <dir>]
// Downloads the rh archive pinned in rh.lock.json, checks it against the lock and the
// release's SHA256SUMS, and stages rh, rivethub-migrate and rh's LICENSE in prod-resources/rh
// for electron-builder's extraResources.
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import { verifySha256Sums } from "@rivethub/shared/sha256sums";

import { isRhTarget, rhLock, rhTargetFor, type RhLock, type RhTarget } from "../src/rh/rhLock.ts";

const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const STAGE_DIR = path.join(desktopDir, "prod-resources", "rh");
/** What is staged from the archive, with its mode. rh is Apache-2.0, so its LICENSE ships with it. */
export const STAGED_FILES = { rh: 0o755, "rivethub-migrate": 0o755, LICENSE: 0o644 } as const;
const SUMS = "SHA256SUMS";
export const MAX_DOWNLOAD_BYTES = 256 * 2 ** 20;
export const MAX_FILE_BYTES = 256 * 2 ** 20;
const MAX_REDIRECTS = 5;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export type Download = (url: string, dest: string) => Promise<void>;

export interface FetchRhOptions {
  lock: RhLock;
  target: RhTarget;
  /** Verified downloads live in `<cacheDir>/<sha256>/`, next to the SHA256SUMS they were checked against. */
  cacheDir: string;
  stageDir: string;
  download?: Download;
  /** Largest file staged from the archive. */
  maxFileBytes?: number;
}

export async function fetchRh({ lock, target, cacheDir, stageDir, download = httpDownload, maxFileBytes = MAX_FILE_BYTES }: FetchRhOptions): Promise<{ fromCache: boolean }> {
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
  await stage(path.join(entry, asset), stageDir, maxFileBytes);
  return { fromCache };
}

/** The archive must match both the lock's digest and its line in the release's SHA256SUMS. */
async function verify(dir: string, asset: string, pinned: string): Promise<void> {
  const checked = await verifySha256Sums(path.join(dir, asset), await readFile(path.join(dir, SUMS), "utf8"), asset);
  if (!checked.ok && checked.reason === "not-listed") throw new Error(`the release's ${SUMS} has no line for ${asset}`);
  if (!checked.ok) throw new Error(`${asset} does not match the release's ${SUMS}: listed ${checked.expected}, got ${checked.actual}`);
  if (checked.sha256 !== pinned) throw new Error(`${asset} does not match rh.lock.json: pinned ${pinned}, got ${checked.sha256}`);
}

async function stage(archive: string, stageDir: string, maxFileBytes: number): Promise<void> {
  const members = (await run("tar", ["-tzf", archive])).split("\n");
  const picks = await Promise.all(
    Object.entries(STAGED_FILES).map(async ([name, mode]) => {
      const found = members.filter((member) => member === name || member === `./${name}`);
      if (found.length !== 1) throw new Error(`${path.basename(archive)} should hold one ${name} at its top level, found ${found.length}`);
      if (!(await run("tar", ["-tvzf", archive, found[0]!])).startsWith("-")) throw new Error(`${name} in ${path.basename(archive)} is not a regular file`);
      return { name, mode, member: found[0]! };
    }),
  );
  await mkdir(path.dirname(stageDir), { recursive: true });
  const tmp = await mkdtemp(`${stageDir}.tmp-`);
  try {
    for (const { name, mode, member } of picks) await extract(archive, member, path.join(tmp, name), mode, maxFileBytes);
    await chmod(tmp, 0o755);
    await rm(stageDir, { recursive: true, force: true });
    await rename(tmp, stageDir);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Writes one archive member to `dest`, stopping tar once more than `maxBytes` come out. */
async function extract(archive: string, member: string, dest: string, mode: number, maxBytes: number): Promise<void> {
  const tar = spawn("tar", ["-xzOf", archive, member], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  tar.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  const copied = pipeline(tar.stdout, atMost(maxBytes, `${member} in ${path.basename(archive)}`), createWriteStream(dest, { flags: "wx" })).catch(
    (error: unknown) => {
      tar.kill();
      throw error;
    },
  );
  const [[code]] = await Promise.all([once(tar, "close") as Promise<[number | null]>, copied]);
  if (code !== 0) throw new Error(`tar could not extract ${member} from ${path.basename(archive)}: ${stderr.trim()}`);
  await chmod(dest, mode);
}

async function run(command: string, args: string[]): Promise<string> {
  return (await promisify(execFile)(command, args, { maxBuffer: 1 << 20 })).stdout;
}

/** GETs `url` over https only, following at most five redirects that stay on https, and writes at most `maxBytes` to `dest`. */
export async function httpDownload(url: string, dest: string, maxBytes = MAX_DOWNLOAD_BYTES): Promise<void> {
  const response = await getHttps(url);
  if (!response.ok || !response.body) throw new Error(`GET ${url}: HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes) {
    await response.body.cancel();
    throw new Error(`GET ${url}: ${length} bytes is over the ${maxBytes}-byte limit`);
  }
  await pipeline(Readable.fromWeb(response.body as ReadableStream), atMost(maxBytes, `GET ${url}`), createWriteStream(dest, { flags: "wx" }));
}

async function getHttps(url: string): Promise<Response> {
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (new URL(url).protocol !== "https:") throw new Error(`refusing ${url}: downloads stay on https`);
    const response = await fetch(url, { redirect: "manual" });
    const location = response.headers.get("location");
    if (!REDIRECTS.has(response.status) || location === null) return response;
    await response.body?.cancel();
    url = new URL(location, url).href;
  }
  throw new Error(`GET ${url}: more than ${MAX_REDIRECTS} redirects`);
}

/** Passes bytes through until more than `maxBytes` have gone by, then fails the stream. */
function atMost(maxBytes: number, what: string): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.length;
      done(seen > maxBytes ? new Error(`${what}: over the ${maxBytes}-byte limit`) : null, chunk);
    },
  });
}

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
