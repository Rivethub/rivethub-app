import { z } from "zod";

import lockJson from "../../rh.lock.json" with { type: "json" };

export const RH_TARGETS = ["x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu", "universal-apple-darwin"] as const;
export type RhTarget = (typeof RH_TARGETS)[number];

const RhAsset = z.object({ asset: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/, "expected a lowercase hex SHA-256") });

/** `rh.lock.json`: the rh release this app bundles, one archive per target, digests copied from the release's SHA256SUMS. */
export const RhLock = z
  .object({
    repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    targets: z.object({
      "x86_64-unknown-linux-gnu": RhAsset,
      "aarch64-unknown-linux-gnu": RhAsset,
      "universal-apple-darwin": RhAsset,
    }),
  })
  .superRefine((lock, ctx) => {
    for (const target of RH_TARGETS) {
      const expected = `rh-${lock.version}-${target}.tar.gz`;
      if (lock.targets[target].asset !== expected) {
        ctx.addIssue({ code: "custom", path: ["targets", target, "asset"], message: `expected ${expected}` });
      }
    }
  });
export type RhLock = z.infer<typeof RhLock>;

export const rhLock: RhLock = RhLock.parse(lockJson);

export function isRhTarget(value: string): value is RhTarget {
  return (RH_TARGETS as readonly string[]).includes(value);
}

/** The archive that runs on this platform; macOS gets the universal binary. Null where rh has no native build. */
export function rhTargetFor(platform: NodeJS.Platform, arch: string): RhTarget | null {
  if (platform === "darwin") return "universal-apple-darwin";
  if (platform !== "linux") return null;
  if (arch === "x64") return "x86_64-unknown-linux-gnu";
  if (arch === "arm64") return "aarch64-unknown-linux-gnu";
  return null;
}

/** The bundled rh, for the About screen. App and rh are versioned independently. */
export const rhPin: { version: string; target: RhTarget | null } = {
  version: rhLock.version,
  target: rhTargetFor(process.platform, process.arch),
};
