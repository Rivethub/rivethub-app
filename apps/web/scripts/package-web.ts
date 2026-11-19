// Packages a built apps/web/dist for the web release rh update installs, and chooses which nightly tags to delete.
//
//   node apps/web/scripts/package-web.ts --dist <dist> --output-dir <dir> --version <semver> --commit <sha> [--tag web-v<version>] [--channel stable|beta|nightly] [--dry-run]
//   node apps/web/scripts/package-web.ts --prune --keep 10 [--protect web-v...]
//
// Writes rivethub-web-<version>.tar.gz (index.html at the archive root) and web-manifest.json.
// The version's x.y.z has to be apps/web/package.json's version. Stable and beta also need the tag web-v plus the release version.
import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin } from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { stampIndexHtml, versionDocument } from "./web-version.ts";

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** SemVer 2.0.0, build metadata in group 5. Release versions reject that group. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const PLAIN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BETA = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/;
const NIGHTLY = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-nightly\.([0-9]{8})\.(0|[1-9]\d*)$/;
const NIGHTLY_TAG = /^web-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-nightly\.([0-9]{8})\.(0|[1-9]\d*)$/;
const COMMIT = /^[0-9a-f]{40}$/;
const BLOCK = 512;

export const CHANNELS = ["stable", "beta", "nightly"] as const;
export type WebChannel = (typeof CHANNELS)[number];

export interface WebManifest {
  schemaVersion: 1;
  version: string;
  commit: string;
  channel: WebChannel;
  minRhVersion: string;
  asset: string;
  sha256: string;
}

export interface PackageWebRequest {
  distDir: string;
  outputDir: string;
  version: string;
  channel: WebChannel;
  commit: string;
  tag?: string;
  packageVersion: string;
  minRhVersion: string;
}

export class PackageWebError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageWebError";
  }
}

export function isWebChannel(value: string): value is WebChannel {
  return (CHANNELS as readonly string[]).includes(value);
}

export function isSemver(value: string): boolean {
  const match = SEMVER.exec(value);
  return match !== null && match[5] === undefined;
}

/** Real UTC calendar day, so a nightly tag cannot carry 20260231. */
export function isUtcDate(yyyymmdd: string): boolean {
  if (!/^[0-9]{8}$/.test(yyyymmdd)) return false;
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function channelForVersion(version: string): WebChannel {
  if (PLAIN.test(version)) return "stable";
  if (BETA.test(version)) return "beta";
  const nightly = NIGHTLY.exec(version);
  if (nightly !== null && isUtcDate(nightly[4] ?? "")) return "nightly";
  throw new PackageWebError(`${version} is not a stable, beta, or nightly semver`);
}

export function packageBase(version: string): string {
  const channel = channelForVersion(version);
  if (channel === "stable") return version;
  if (channel === "beta") return version.slice(0, version.lastIndexOf("-beta."));
  return version.slice(0, version.lastIndexOf("-nightly."));
}

export function archiveName(version: string): string {
  return `rivethub-web-${version}.tar.gz`;
}

export async function readWebPackage(packageJsonPath: string): Promise<{ version: string; minRhVersion: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PackageWebError(`cannot read ${packageJsonPath}: ${detail}`);
  }
  if (typeof parsed !== "object" || parsed === null) throw new PackageWebError(`${packageJsonPath} is not an object`);
  const version = "version" in parsed && typeof parsed.version === "string" ? parsed.version : undefined;
  if (version === undefined || !PLAIN.test(version)) throw new PackageWebError(`package version must be x.y.z, got ${String(version)}`);
  const rivethub = "rivethub" in parsed ? parsed.rivethub : undefined;
  const minRhVersion =
    typeof rivethub === "object" && rivethub !== null && "minRhVersion" in rivethub && typeof rivethub.minRhVersion === "string"
      ? rivethub.minRhVersion
      : undefined;
  if (minRhVersion === undefined) throw new PackageWebError(`${packageJsonPath} has no rivethub.minRhVersion`);
  if (!isSemver(minRhVersion)) throw new PackageWebError(`minRhVersion must be semver, got ${minRhVersion}`);
  return { version, minRhVersion };
}

interface RankedTag {
  tag: string;
  major: number;
  minor: number;
  patch: number;
  date: number;
  run: number;
}

/** Tags to delete so the newest `keep` nightlies remain. `protect` is never deleted. Other tags are ignored. */
export function nightlyTagsToPrune(tags: readonly string[], keep: number, protect?: string): string[] {
  if (!Number.isInteger(keep) || keep < 1) throw new PackageWebError(`keep must be a positive integer, got ${keep}`);
  const ranked: RankedTag[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    const match = NIGHTLY_TAG.exec(tag);
    if (match === null) continue;
    const date = match[4] ?? "";
    if (!isUtcDate(date)) continue;
    ranked.push({
      tag,
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      date: Number(date),
      run: Number(match[5]),
    });
  }
  ranked.sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch || b.date - a.date || b.run - a.run);
  const retain = new Set(ranked.slice(0, keep).map((entry) => entry.tag));
  if (protect !== undefined) retain.add(protect);
  return ranked.filter((entry) => !retain.has(entry.tag)).map((entry) => entry.tag);
}

interface DistEntry {
  name: string;
  body: Buffer;
  typeflag: "0" | "5";
  mode: number;
}

async function readDist(distDir: string): Promise<DistEntry[]> {
  const root = path.resolve(distDir);
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PackageWebError(`dist not found: ${distDir} (${detail})`);
  }
  if (!rootStat.isDirectory()) throw new PackageWebError(`dist is not a directory: ${distDir}`);

  const entries: DistEntry[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const name of await readdir(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (rel === "" || rel.split("/").includes("..")) throw new PackageWebError(`refusing path ${rel}`);
      const stat = await lstat(full);
      if (stat.isSymbolicLink()) throw new PackageWebError(`${rel} is a link`);
      if (stat.isDirectory()) {
        entries.push({ name: `${rel}/`, body: Buffer.alloc(0), typeflag: "5", mode: 0o755 });
        await walk(full);
      } else if (stat.isFile()) {
        entries.push({ name: rel, body: await readFile(full), typeflag: "0", mode: 0o644 });
      } else {
        throw new PackageWebError(`${rel} is not a regular file`);
      }
    }
  };
  await walk(root);
  if (!entries.some((entry) => entry.name === "index.html" && entry.typeflag === "0")) throw new PackageWebError("dist has no index.html");
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries;
}

function writeOctal(buf: Buffer, offset: number, length: number, value: number): void {
  const digits = value.toString(8).padStart(length - 1, "0");
  if (digits.length !== length - 1) throw new PackageWebError(`tar number ${value} does not fit in ${length} bytes`);
  buf.write(digits, offset, length - 1, "ascii");
  buf[offset + length - 1] = 0;
}

function writeBytes(buf: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) throw new PackageWebError(`tar field is longer than ${length} bytes`);
  bytes.copy(buf, offset);
}

function tarHeader(fields: { name: string; prefix?: string; size: number; typeflag: string; mode: number }): Buffer {
  const buf = Buffer.alloc(BLOCK);
  writeBytes(buf, 0, 100, fields.name);
  writeOctal(buf, 100, 8, fields.mode);
  writeOctal(buf, 108, 8, 0);
  writeOctal(buf, 116, 8, 0);
  writeOctal(buf, 124, 12, fields.size);
  writeOctal(buf, 136, 12, 0);
  buf.fill(0x20, 148, 156);
  buf[156] = fields.typeflag.charCodeAt(0);
  buf.write("ustar\0", 257, "ascii");
  buf.write("00", 263, "ascii");
  if (fields.prefix !== undefined && fields.prefix !== "") writeBytes(buf, 345, 155, fields.prefix);
  let sum = 0;
  for (const byte of buf) sum += byte;
  const checksum = sum.toString(8).padStart(6, "0");
  buf.write(checksum, 148, 6, "ascii");
  buf[154] = 0;
  buf[155] = 0x20;
  return buf;
}

function padded(body: Buffer): Buffer {
  if (body.length === 0) return body;
  const extra = (BLOCK - (body.length % BLOCK)) % BLOCK;
  return extra === 0 ? body : Buffer.concat([body, Buffer.alloc(extra)]);
}

/** Length prefix counts its own digits, in bytes, as pax requires. */
function paxRecord(key: string, value: string): Buffer {
  const suffix = ` ${key}=${value}\n`;
  const suffixBytes = Buffer.byteLength(suffix);
  for (let digits = 1; digits < 12; digits += 1) {
    const length = digits + suffixBytes;
    if (String(length).length === digits) return Buffer.from(`${length}${suffix}`, "utf8");
  }
  throw new PackageWebError("pax record too long");
}

function splitUstar(member: string): { name: string; prefix: string } | null {
  if (Buffer.byteLength(member) <= 100) return { name: member, prefix: "" };
  let index = 0;
  while ((index = member.indexOf("/", index + 1)) !== -1) {
    const prefix = member.slice(0, index);
    const name = member.slice(index + 1);
    if (prefix.length > 0 && name.length > 0 && Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  return null;
}

function fallbackName(member: string): string {
  const base = member.split("/").filter((part) => part !== "").at(-1) ?? "file";
  return Buffer.byteLength(base) <= 100 ? base : "file";
}

/** mtime 0, uid 0, and modes 0644/0755 so the bytes don't follow the clock or the umask. gzip mtime is 0 for the same reason. */
function archiveDist(entries: readonly DistEntry[]): Buffer {
  const parts: Buffer[] = [];
  entries.forEach((entry, index) => {
    const placed = splitUstar(entry.name);
    if (placed === null) {
      const records = paxRecord("path", entry.name);
      parts.push(tarHeader({ name: `PaxHeaders/${index}`, size: records.length, typeflag: "x", mode: 0o644 }));
      parts.push(padded(records));
      parts.push(tarHeader({ name: fallbackName(entry.name), size: entry.body.length, typeflag: entry.typeflag, mode: entry.mode }));
    } else if (placed.prefix === "") {
      parts.push(tarHeader({ name: placed.name, size: entry.body.length, typeflag: entry.typeflag, mode: entry.mode }));
    } else {
      parts.push(tarHeader({ name: placed.name, prefix: placed.prefix, size: entry.body.length, typeflag: entry.typeflag, mode: entry.mode }));
    }
    parts.push(padded(entry.body));
  });
  parts.push(Buffer.alloc(BLOCK * 2));
  // The gzip CRC covers the payload, not the header, so the clock in bytes 4-7 can be cleared
  // without invalidating the file. @types/node's ZlibOptions does not expose mtime.
  const gzipped = gzipSync(Buffer.concat(parts), { level: 9 });
  gzipped.writeUInt32LE(0, 4);
  return gzipped;
}

function assertRelease(request: PackageWebRequest): void {
  const channel = channelForVersion(request.version);
  if (request.channel !== channel) throw new PackageWebError(`channel ${request.channel} does not match version ${request.version}`);
  if (!PLAIN.test(request.packageVersion)) throw new PackageWebError(`package version must be x.y.z, got ${request.packageVersion}`);
  if (packageBase(request.version) !== request.packageVersion) {
    throw new PackageWebError(`version ${request.version} does not match package version ${request.packageVersion}`);
  }
  if (!isSemver(request.minRhVersion)) throw new PackageWebError(`minRhVersion must be semver, got ${request.minRhVersion}`);
  if (!COMMIT.test(request.commit)) throw new PackageWebError(`commit must be a 40-character lowercase sha, got ${request.commit}`);
  const expectedTag = `web-v${request.version}`;
  if (channel === "stable" || channel === "beta") {
    if (request.tag === undefined) throw new PackageWebError(`a ${channel} release needs a tag`);
    if (request.tag !== expectedTag) throw new PackageWebError(`tag ${request.tag} does not match package version ${request.packageVersion}`);
  } else if (request.tag !== undefined && request.tag !== expectedTag) {
    throw new PackageWebError(`tag ${request.tag} does not match version ${request.version}`);
  }
}

function stampEntries(entries: DistEntry[], version: string, commit: string): DistEntry[] {
  const html = entries.find((entry) => entry.name === "index.html" && entry.typeflag === "0");
  if (html === undefined) throw new PackageWebError("dist has no index.html");
  const stamped = entries
    .filter((entry) => entry.name !== "version.json")
    .map((entry) => (entry === html ? { ...entry, body: Buffer.from(stampIndexHtml(entry.body.toString("utf8"), version, commit)) } : entry));
  stamped.push({ name: "version.json", body: Buffer.from(versionDocument(version, commit)), typeflag: "0", mode: 0o644 });
  stamped.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return stamped;
}

export async function packageWebRelease(request: PackageWebRequest): Promise<{ archivePath: string; manifestPath: string; manifest: WebManifest }> {
  assertRelease(request);
  const dist = path.resolve(request.distDir);
  const output = path.resolve(request.outputDir);
  if (output === dist || output.startsWith(`${dist}${path.sep}`)) throw new PackageWebError("output dir must not be inside dist");
  const archived = archiveDist(stampEntries(await readDist(dist), request.version, request.commit));
  const asset = archiveName(request.version);
  const manifest: WebManifest = {
    schemaVersion: 1,
    version: request.version,
    commit: request.commit,
    channel: request.channel,
    minRhVersion: request.minRhVersion,
    asset,
    sha256: createHash("sha256").update(archived).digest("hex"),
  };
  await mkdir(output, { recursive: true });
  const archivePath = path.join(output, asset);
  const manifestPath = path.join(output, "web-manifest.json");
  await writeFile(archivePath, archived);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { archivePath, manifestPath, manifest };
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value === "") throw new PackageWebError(`${flag} is required`);
  return value;
}

async function readStdin(): Promise<string> {
  if (stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function prune(keepText: string | undefined, protect: string | undefined): Promise<void> {
  const text = keepText ?? "10";
  if (!/^[1-9][0-9]*$/.test(text)) throw new PackageWebError(`--keep must be a positive integer, got ${text}`);
  const tags = (await readStdin()).split("\n").map((line) => line.trim()).filter((line) => line !== "");
  for (const tag of nightlyTagsToPrune(tags, Number(text), protect)) console.log(tag);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dist: { type: "string" },
      "output-dir": { type: "string" },
      version: { type: "string" },
      channel: { type: "string" },
      commit: { type: "string" },
      tag: { type: "string" },
      "package-json": { type: "string" },
      "dry-run": { type: "boolean" },
      prune: { type: "boolean" },
      keep: { type: "string" },
      protect: { type: "string" },
    },
  });
  if (values.prune === true) {
    await prune(values.keep, values.protect);
    return;
  }
  const version = required(values.version, "--version");
  if (values.channel !== undefined && !isWebChannel(values.channel)) throw new PackageWebError("--channel must be stable, beta, or nightly");
  const channel = channelForVersion(version);
  if (values.channel !== undefined && values.channel !== channel) throw new PackageWebError(`--channel ${values.channel} does not match version ${version}`);
  const declared = await readWebPackage(values["package-json"] ?? path.join(webDir, "package.json"));
  const request: PackageWebRequest = {
    distDir: required(values.dist, "--dist"),
    outputDir: required(values["output-dir"], "--output-dir"),
    version,
    channel,
    commit: required(values.commit, "--commit"),
    packageVersion: declared.version,
    minRhVersion: declared.minRhVersion,
  };
  if (values.tag !== undefined) request.tag = values.tag;
  const result = await packageWebRelease(request);
  if (values["dry-run"] === true) console.log("dry run");
  console.log(result.archivePath);
  console.log(result.manifestPath);
  console.log(JSON.stringify(result.manifest, null, 2));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    if (error instanceof PackageWebError) console.error(`package-web: ${error.message}`);
    else console.error(error);
    process.exitCode = 1;
  });
}
