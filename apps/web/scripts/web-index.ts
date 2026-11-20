// Prints the index rebuilt from GitHub releases. --dry-run uses only unauthenticated public reads.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { archiveName, channelForVersion, isSemver, PackageWebError, type WebChannel, type WebManifest } from "./package-web.ts";

const TAG_PREFIX = "web-v";
const MANIFEST_NAME = "web-manifest.json";
const CHANNEL_LIMIT = 10;

interface PublishedWebRelease {
  tag: string;
  manifest?: unknown;
  archiveUrl?: string;
  manifestUrl?: string;
}

interface WebIndexEntry {
  manifest: WebManifest;
  archiveUrl: string;
  manifestUrl: string;
}

interface WebIndex {
  schemaVersion: 1;
  generatedAt: string;
  channels: Record<WebChannel, WebIndexEntry[]>;
}

function channelForTag(tag: string): WebChannel | undefined {
  if (!tag.startsWith(TAG_PREFIX)) return;
  try {
    return channelForVersion(tag.slice(TAG_PREFIX.length));
  } catch (error) {
    if (!(error instanceof PackageWebError)) throw error;
  }
}

function isManifest(value: unknown, version: string, channel: WebChannel): value is WebManifest {
  if (typeof value !== "object" || value === null) return false;
  const manifest = value as Record<string, unknown>;
  return manifest.schemaVersion === 1 && manifest.version === version && manifest.channel === channel
    && manifest.asset === archiveName(version)
    && typeof manifest.commit === "string" && /^[0-9a-f]{40}$/.test(manifest.commit)
    && typeof manifest.sha256 === "string" && /^[0-9a-f]{64}$/.test(manifest.sha256)
    && typeof manifest.minRhVersion === "string" && isSemver(manifest.minRhVersion);
}

// Within a channel, versions have the same form. Numeric components include the
// beta number or the nightly UTC date and run number after the base version.
function newestFirst(a: WebIndexEntry, b: WebIndexEntry): number {
  const partsA = a.manifest.version.match(/\d+/g) ?? [];
  const partsB = b.manifest.version.match(/\d+/g) ?? [];
  for (const [index, part] of partsA.entries()) {
    const difference = BigInt(partsB[index] ?? "0") - BigInt(part);
    if (difference !== 0n) return difference > 0n ? 1 : -1;
  }
  return 0;
}

// A release whose manifest breaks the contract is left out, as `rh update` leaves it out, so one bad release cannot stop the index.
export function buildWebIndex(releases: readonly PublishedWebRelease[], generatedAt: string, skipped?: (tag: string) => void): WebIndex {
  const channels: WebIndex["channels"] = { stable: [], beta: [], nightly: [] };
  for (const { tag, manifest, archiveUrl, manifestUrl } of releases) {
    const channel = channelForTag(tag);
    if (channel === undefined || manifest === undefined || archiveUrl === undefined || manifestUrl === undefined) continue;
    if (!isManifest(manifest, tag.slice(TAG_PREFIX.length), channel)) {
      skipped?.(tag);
      continue;
    }
    channels[channel].push({ manifest, archiveUrl, manifestUrl });
  }
  for (const entries of Object.values(channels)) {
    entries.sort(newestFirst);
    entries.splice(CHANNEL_LIMIT);
  }
  return { schemaVersion: 1, generatedAt, channels };
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  assets: { name: string; browser_download_url: string }[];
}

async function readPublishedReleases(repo: string, token?: string): Promise<PublishedWebRelease[]> {
  const releases = new Map<string, PublishedWebRelease>();
  const pageSize = 100;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=${pageSize}&page=${page}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub release listing failed (HTTP ${response.status} on page ${page})`);
    const published = await response.json() as GitHubRelease[];
    for (const { tag_name: tag, draft, assets } of published) {
      if (draft || releases.has(tag) || channelForTag(tag) === undefined) continue;
      const manifestUrl = assets.find((asset) => asset.name === MANIFEST_NAME)?.browser_download_url;
      const archiveUrl = assets.find((asset) => asset.name === archiveName(tag.slice(TAG_PREFIX.length)))?.browser_download_url;
      if (manifestUrl === undefined || archiveUrl === undefined) continue;
      const download = await fetch(manifestUrl, { signal: AbortSignal.timeout(30_000) });
      // A main run can prune a nightly between listing its release and fetching its manifest.
      if (download.status === 404) continue;
      if (!download.ok) throw new Error(`manifest download for ${tag} failed (HTTP ${download.status})`);
      releases.set(tag, { tag, manifest: await download.json(), archiveUrl, manifestUrl });
    }
    if (published.length < pageSize) return [...releases.values()];
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean" } } });
  const publicRepo = "Rivethub/rivethub-app";
  const dryRun = values["dry-run"] === true;
  const repo = dryRun ? publicRepo : process.env.GITHUB_REPOSITORY ?? publicRepo;
  const releases = await readPublishedReleases(repo, dryRun ? undefined : process.env.GH_TOKEN);
  const index = buildWebIndex(releases, new Date().toISOString(), (tag) => console.error(`web-index: left out ${tag}, its manifest breaks the contract`));
  console.log(JSON.stringify(index, null, 2));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error("web-index:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
