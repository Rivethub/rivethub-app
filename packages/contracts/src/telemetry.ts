import { z } from "zod";

const version = z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
const os = z.enum(["linux-x86_64", "linux-aarch64", "macos-x86_64", "macos-aarch64", "windows-x86_64"]);
const installId = z.guid();
const job = z.enum(["gateway", "capture", "embedder", "summarizer", "categorizer", "wiki-writer", "mcp", "cli", "web"]);
const frame = z.string().max(160).regex(/^[A-Za-z0-9_:<>.\-\s]+$/, "frames carry module paths and line numbers only");

export const crashReport = z
  .object({
    schema: z.literal(1),
    installId,
    rh: version,
    os,
    job,
    kind: z.enum(["panic", "error", "oom", "abort", "unhandled-rejection"]),
    where: frame,
    frames: z.array(frame).max(40),
    at: z.union([z.iso.datetime(), z.iso.datetime({ precision: -1 })]),
  })
  .strict();

const count = z.number().int().nonnegative().max(10_000_000);

export const usageReport = z
  .object({
    schema: z.literal(1),
    installId,
    rh: version,
    os,
    day: z.iso.date(),
    counts: z
      .object({
        sessionsCaptured: count,
        harnessesConnected: count,
        reviewDecisions: count,
        searches: count,
        topics: count,
        entities: count,
        appOpens: count,
      })
      .partial()
      .strict(),
  })
  .strict();

export type CrashReport = z.infer<typeof crashReport>;
export type UsageReport = z.infer<typeof usageReport>;
