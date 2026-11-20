import { describe, expect, it } from "vitest";
import type { WebChannel, WebManifest } from "./package-web";
import { buildWebIndex } from "./web-index";

const GENERATED_AT = "2026-11-20T12:00:00.000Z";

function release(version: string, channel: WebChannel) {
  const tag = `web-v${version}`;
  const baseUrl = `https://github.com/Rivethub/rivethub-app/releases/download/${tag}`;
  const manifest: WebManifest = {
    schemaVersion: 1,
    version,
    commit: "a".repeat(40),
    channel,
    minRhVersion: "0.8.3",
    asset: `rivethub-web-${version}.tar.gz`,
    sha256: "b".repeat(64),
  };
  return { tag, manifest, archiveUrl: `${baseUrl}/${manifest.asset}`, manifestUrl: `${baseUrl}/web-manifest.json` };
}

describe("buildWebIndex", () => {
  it("orders versions, beta numbers, nightly dates and nightly run numbers numerically within each channel", () => {
    const index = buildWebIndex([
      release("0.9.16", "stable"),
      release("0.10.2-beta.2", "beta"),
      release("0.9.16-nightly.20261120.99", "nightly"),
      release("0.10.2-nightly.20261119.9", "nightly"),
      release("0.9.16-beta.99", "beta"),
      release("0.10.2-nightly.20261118.99", "nightly"),
      release("0.10.2-nightly.20261119.10", "nightly"),
      release("0.10.2-beta.10", "beta"),
      release("0.10.2", "stable"),
    ], GENERATED_AT);
    expect(index.channels.stable.map(({ manifest }) => manifest.version)).toEqual(["0.10.2", "0.9.16"]);
    expect(index.channels.beta.map(({ manifest }) => manifest.version)).toEqual(["0.10.2-beta.10", "0.10.2-beta.2", "0.9.16-beta.99"]);
    expect(index.channels.nightly.map(({ manifest }) => manifest.version)).toEqual([
      "0.10.2-nightly.20261119.10",
      "0.10.2-nightly.20261119.9",
      "0.10.2-nightly.20261118.99",
      "0.9.16-nightly.20261120.99",
    ]);
  });

  it("caps each channel at its 10 newest builds", () => {
    const releases = Array.from({ length: 12 }, (_, i) => [
      release(`1.0.${i}`, "stable"),
      release(`1.0.0-beta.${i}`, "beta"),
      release(`1.0.0-nightly.20261120.${i}`, "nightly"),
    ]).flat();
    const { channels } = buildWebIndex(releases, GENERATED_AT);
    expect(Object.values(channels).map((entries) => entries.length)).toEqual([10, 10, 10]);
    expect(Object.values(channels).map((entries) => entries.at(-1)?.manifest.version)).toEqual([
      "1.0.2", "1.0.0-beta.2", "1.0.0-nightly.20261120.2",
    ]);
  });

  it("skips missing manifests, missing assets, non-web tags, and unsupported web tags", () => {
    const stable = release("0.8.16", "stable");
    const { manifest: _manifest, ...withoutManifest } = release("0.8.17", "stable");
    const { archiveUrl: _archiveUrl, ...withoutArchive } = release("0.8.18", "stable");
    const releases = [stable, withoutManifest, withoutArchive, { ...stable, tag: "v0.8.16" }, { ...stable, tag: "web-v0.8.16-rc" }];
    expect(buildWebIndex(releases, GENERATED_AT)).toEqual({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      channels: { stable: [{ manifest: stable.manifest, archiveUrl: stable.archiveUrl, manifestUrl: stable.manifestUrl }], beta: [], nightly: [] },
    });
  });

  it("keeps the complete manifest and produces identical JSON for the same releases apart from generatedAt", () => {
    const stable = release("0.8.16", "stable");
    const additive = { ...stable, manifest: { ...stable.manifest, extra: { marker: true } } };
    const releases = [additive, release("0.8.15", "stable")];
    const index = buildWebIndex(releases, GENERATED_AT);
    expect(index.channels.stable[0]?.manifest).toEqual(additive.manifest);
    const later = "2026-11-20T13:00:00.000Z";
    expect(JSON.stringify(buildWebIndex(releases, later))).toBe(JSON.stringify(index).replace(GENERATED_AT, later));
    expect(JSON.stringify(buildWebIndex([...releases].reverse(), GENERATED_AT))).toBe(JSON.stringify(index));
  });
});
