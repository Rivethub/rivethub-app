import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename } from "node:path";

const LINE = /^([0-9a-fA-F]{64}) [ *](.+)$/;

/** Parses `sha256sum` output into file name → lowercase hex digest. Throws on a line it cannot read. */
export function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const match = LINE.exec(line);
    if (!match) throw new Error(`SHA256SUMS has a line it cannot read: ${JSON.stringify(line)}`);
    const name = match[2]!;
    if (sums.has(name)) throw new Error(`SHA256SUMS lists ${JSON.stringify(name)} more than once`);
    sums.set(name, match[1]!.toLowerCase());
  }
  return sums;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export type ChecksumResult =
  | { ok: true; sha256: string }
  | { ok: false; reason: "not-listed"; name: string }
  | { ok: false; reason: "mismatch"; name: string; expected: string; actual: string };

/** Checks `file` against its entry in a SHA256SUMS text, looked up by `name` (the file's base name by default). */
export async function verifySha256Sums(file: string, sumsText: string, name = basename(file)): Promise<ChecksumResult> {
  const expected = parseSha256Sums(sumsText).get(name);
  if (!expected) return { ok: false, reason: "not-listed", name };
  const actual = await sha256File(file);
  return actual === expected ? { ok: true, sha256: actual } : { ok: false, reason: "mismatch", name, expected, actual };
}
