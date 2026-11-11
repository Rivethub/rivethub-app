import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { updateChannelFor } from "../updates/updateFeed";
import { isUpdateChannel, readUpdateChannel, writeUpdateChannel } from "./updateChannel";

const STABLE_BUILD = updateChannelFor("0.1.0");
const NIGHTLY_BUILD = updateChannelFor("0.2.0-nightly.20261111.1");

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "rivethub-update-channel-"));
  file = path.join(dir, "nested", "update-settings.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("update channel setting", () => {
  it("follows the build when nothing was saved: stable for 0.1.0, nightly for a nightly", () => {
    expect([STABLE_BUILD, NIGHTLY_BUILD]).toEqual(["stable", "nightly"]);
    expect(readUpdateChannel(file, STABLE_BUILD)).toBe("stable");
    expect(readUpdateChannel(file, NIGHTLY_BUILD)).toBe("nightly");
  });

  it("a saved channel wins over the build's", () => {
    writeUpdateChannel(file, "nightly");
    expect(readUpdateChannel(file, STABLE_BUILD)).toBe("nightly");
    writeUpdateChannel(file, "stable");
    expect(readUpdateChannel(file, NIGHTLY_BUILD)).toBe("stable");
  });

  it.each([["not json"], ['{"channel":"beta"}'], ['{"channel":null}'], ["[]"]])("falls back to the build's channel on %s", (contents) => {
    writeUpdateChannel(file, "nightly");
    writeFileSync(file, contents);
    expect(readUpdateChannel(file, STABLE_BUILD)).toBe("stable");
    expect(readUpdateChannel(file, NIGHTLY_BUILD)).toBe("nightly");
  });

  it("refuses to save a channel that isn't stable or nightly", () => {
    expect(() => writeUpdateChannel(file, "beta" as never)).toThrow();
    expect(readUpdateChannel(file, STABLE_BUILD)).toBe("stable");
  });

  it("accepts only stable and nightly from IPC", () => {
    expect(["stable", "nightly", "latest", "", null, 1].map(isUpdateChannel)).toEqual([true, true, false, false, false, false]);
  });
});
