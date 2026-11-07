import type { CrashReport, UsageReport } from "@rivethub/contracts";
import { z } from "zod";

export const channels = ["stable", "beta"] as const;
export type Channel = (typeof channels)[number];

export const releaseInput = z.object({
  channel: z.enum(channels),
  os: z.enum(["linux-x86_64", "linux-aarch64", "macos-x86_64", "macos-aarch64", "windows-x86_64"]),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/),
  url: z.string().url().startsWith("https://"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z.string().min(1),
  notesUrl: z.string().url().startsWith("https://"),
});
export type Release = z.infer<typeof releaseInput>;

export interface NewSignIn {
  id: string;
  secretHash: string;
  email: string;
  expiresAt: Date;
}

export type SignInOutcome =
  | { kind: "pending" }
  | { kind: "expired" }
  | { kind: "signedIn"; email: string };

export interface Session {
  userId: string;
  email: string;
}

/** Telemetry as stored: the raw installId never reaches the store. */
export type Stored<T extends { installId: string }> = Omit<T, "installId"> & { installHash: string };

export interface Store {
  createSignIn(request: NewSignIn): Promise<void>;
  /** True only the first time, with the right secret, before expiry. */
  verifySignIn(id: string, secretHash: string, now: Date): Promise<boolean>;
  /** Atomically consumes a verified request, creating the user on first sign-in and storing the token hash. */
  completeSignIn(id: string, tokenHash: string, now: Date): Promise<SignInOutcome>;
  findSession(tokenHash: string): Promise<Session | null>;
  revokeToken(tokenHash: string): Promise<void>;
  /** Removes the user, their tokens and any sign-in requests for their email. */
  deleteUser(userId: string): Promise<void>;
  addCrash(report: Stored<CrashReport>, receivedAt: Date): Promise<void>;
  /** One row per install and day. A later report for the same day replaces the earlier one. */
  addUsage(report: Stored<UsageReport>, receivedAt: Date): Promise<void>;
  addRelease(release: Release, createdAt: Date): Promise<void>;
  listReleases(channel: Channel, os: Release["os"]): Promise<Release[]>;
  purgeExpired(now: Date): Promise<void>;
  /** Deletes crash and usage rows received before the cutoff. */
  purgeTelemetry(cutoff: Date): Promise<void>;
  counts(): Promise<{ users: number; crashes: number; usage: number }>;
  close(): Promise<void>;
}
