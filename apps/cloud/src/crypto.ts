import { createHash, createHmac, randomBytes } from "node:crypto";

export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Keyed, lowercased so one install always maps to one hash. Not reversible without the salt. */
export function installHash(salt: string, installId: string): string {
  return createHmac("sha256", salt).update(installId.toLowerCase()).digest("hex");
}
