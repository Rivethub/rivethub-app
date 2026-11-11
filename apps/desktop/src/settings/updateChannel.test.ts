import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isUpdateChannel, readUpdateChannel, writeUpdateChannel } from "./updateChannel";

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "rivethub-update-channel-"));
  file = path.join(dir, "nested", "update-settings.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("update channel setting", () => {
  it("is stable when nothing was saved", () => {
    expect(readUpdateChannel(file)).toBe("stable");
  });

  it("keeps a nightly opt-in across reads, and switching back to stable", () => {
    writeUpdateChannel(file, "nightly");
    expect(readUpdateChannel(file)).toBe("nightly");
    writeUpdateChannel(file, "stable");
    expect(readUpdateChannel(file)).toBe("stable");
  });

  it.each([["not json"], ['{"channel":"beta"}'], ['{"channel":null}'], ["[]"]])("falls back to stable on %s", (contents) => {
    writeUpdateChannel(file, "nightly");
    writeFileSync(file, contents);
    expect(readUpdateChannel(file)).toBe("stable");
  });

  it("refuses to save a channel that isn't stable or nightly", () => {
    expect(() => writeUpdateChannel(file, "beta" as never)).toThrow();
    expect(readUpdateChannel(file)).toBe("stable");
  });

  it("accepts only stable and nightly from IPC", () => {
    expect(["stable", "nightly", "latest", "", null, 1].map(isUpdateChannel)).toEqual([true, true, false, false, false, false]);
  });
});
