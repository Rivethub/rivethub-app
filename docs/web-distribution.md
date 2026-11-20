# Web distribution contract

Hosts can install a pinned RivetHub web build directly from this repository's GitHub release assets.

## Release tags and assets

Every web build has a tag `web-v<version>`.

| Channel | Version | Tag example |
| --- | --- | --- |
| Stable | `X.Y.Z` | `web-v0.8.16` |
| Beta | `X.Y.Z-beta.N` | `web-v0.8.16-beta.1` |
| Nightly | `X.Y.Z-nightly.YYYYMMDD.N` | `web-v0.8.16-nightly.20261120.28` |

`X`, `Y`, `Z`, and `N` are decimal integers with no leading zeros, except for zero itself. Nightly dates are valid UTC calendar dates, and nightly `N` is the GitHub Actions run number.

Each build release has two assets with fixed names.

- `rivethub-web-<version>.tar.gz` is the gzip-compressed tar archive, with `index.html` at the archive root.
- `web-manifest.json` describes that archive.

Published builds keep their version and asset contents. Nightly releases are subject to retention and can be removed. The release workflow keeps the newest 10 nightlies and can retain an additional nightly while protecting the build it just published.

The stable `web-v0.8.16` bundle is published when the 0.8.16 release ships, not before.

## Build manifest

Each field below is required in `web-manifest.json`. Version 1 preserves these field names, types, and meanings.

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Version of the manifest schema. The value is `1` for this contract. |
| `version` | string | Full web build version, including any beta or nightly suffix. It is the release tag with the `web-v` prefix removed. |
| `commit` | string | Full Git commit ID used for the build, as 40 lowercase hexadecimal characters. |
| `channel` | string | One of `stable`, `beta`, or `nightly`, as determined by the tag grammar above. |
| `minRhVersion` | string | Minimum compatible `rh` version, expressed as SemVer without build metadata. |
| `asset` | string | Archive filename, exactly `rivethub-web-<version>.tar.gz`. |
| `sha256` | string | SHA-256 of the compressed archive bytes, as 64 lowercase hexadecimal characters. |

Additive fields keep `schemaVersion` at `1`. Removing a field or changing its type or meaning requires a schema version bump. Hosts should ignore unknown fields and reject schema versions they do not support.

To verify a download, compute SHA-256 over the archive file before extraction. Its lowercase hexadecimal digest must equal the manifest's `sha256`. When pinning a version, save its digest alongside it and require the same digest on later installs.

## Channel index

Download the index from the fixed `web-index` release. [web-index.json](https://github.com/Rivethub/rivethub-app/releases/download/web-index/web-index.json)

The index has its own integer `schemaVersion` of `1`, a `generatedAt` timestamp in UTC ISO 8601 format, and a `channels` object with `stable`, `beta`, and `nightly` arrays. Each entry has three fields.

| Field | Meaning |
| --- | --- |
| `manifest` | The complete build manifest, including any additive fields. |
| `archiveUrl` | Absolute download URL for the archive. |
| `manifestUrl` | Absolute download URL for that release's `web-manifest.json`. |

Each array contains up to 10 builds, newest first. Build versions sort by numeric base version, then by numeric beta number for beta builds or by UTC date and numeric run number for nightlies. A channel with no builds has an empty array.

Take the first entry on the desired channel whose `manifest.minRhVersion` is less than or equal to the installed `rh` version under SemVer precedence. If no entry matches, the index offers no compatible build on that channel. Pin the selected `manifest.version` and `manifest.sha256`, download `archiveUrl`, and verify the digest before installing.
