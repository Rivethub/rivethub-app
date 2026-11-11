import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSha256Sums, verifySha256Sums } from "./sha256sums";

const HELLO_SHA = "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";
let dir: string;
let archive: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "sha256sums-"));
  archive = join(dir, "rh-0.8.0-x86_64-unknown-linux-gnu.tar.gz");
  await writeFile(archive, "hello\n");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const sums = (sha: string) =>
  `2ec035b0e26a7ccce4191b3a2b6f7350b002691bdcac7818fbfb0c72a5370512  rh-0.8.0-aarch64-unknown-linux-gnu.tar.gz\n${sha}  rh-0.8.0-x86_64-unknown-linux-gnu.tar.gz\n`;

describe("verifySha256Sums", () => {
  it("accepts a file whose digest matches its line", async () => {
    expect(await verifySha256Sums(archive, sums(HELLO_SHA))).toEqual({ ok: true, sha256: HELLO_SHA });
  });

  it("rejects a file whose digest differs", async () => {
    const wrong = "0".repeat(64);
    expect(await verifySha256Sums(archive, sums(wrong))).toEqual({
      ok: false,
      reason: "mismatch",
      name: "rh-0.8.0-x86_64-unknown-linux-gnu.tar.gz",
      expected: wrong,
      actual: HELLO_SHA,
    });
  });

  it("rejects a file the sums do not list", async () => {
    expect(await verifySha256Sums(archive, sums(HELLO_SHA), "rh-0.9.0-x86_64-unknown-linux-gnu.tar.gz")).toMatchObject({ ok: false, reason: "not-listed" });
  });
});

describe("parseSha256Sums", () => {
  it("reads text and binary mode lines and normalises case", () => {
    expect(parseSha256Sums(`${HELLO_SHA.toUpperCase()} *a.tar.gz\r\n\n`)).toEqual(new Map([["a.tar.gz", HELLO_SHA]]));
  });

  it("fails closed on a line it cannot read", () => {
    expect(() => parseSha256Sums("not a checksum line\n")).toThrow(/cannot read/);
  });
});
