import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { MIN_SIZE, readWindowState, restorableBounds, writeWindowState } from "./windowState";

const display = { x: 0, y: 0, width: 1920, height: 1080 };
const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "window-state-"));
  dirs.push(dir);
  return path.join(dir, "nested", "window-state.json");
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("window state file", () => {
  it("round-trips", () => {
    const file = tempFile();
    const state = { bounds: { x: 10, y: 20, width: 900, height: 600 }, maximized: true };
    writeWindowState(file, state);
    expect(readWindowState(file)).toEqual(state);
  });

  it("treats a missing or malformed file as no state", () => {
    const file = tempFile();
    expect(readWindowState(file)).toBeNull();
    writeWindowState(file, { bounds: { x: 0, y: 0, width: 800, height: 600 }, maximized: false });
    writeFileSync(file, '{"bounds":{"x":"left"}}');
    expect(readWindowState(file)).toBeNull();
    writeFileSync(file, "{");
    expect(readWindowState(file)).toBeNull();
  });
});

describe("restorableBounds", () => {
  it("restores bounds that sit on a connected display", () => {
    const saved = { bounds: { x: 100, y: 80, width: 1000, height: 700 }, maximized: false };
    expect(restorableBounds(saved, [display])).toEqual(saved.bounds);
  });

  it("drops bounds left on a display that is gone", () => {
    const saved = { bounds: { x: 2500, y: 100, width: 1000, height: 700 }, maximized: false };
    expect(restorableBounds(saved, [display])).toBeNull();
  });

  it("grows bounds smaller than the minimum window", () => {
    const saved = { bounds: { x: 0, y: 0, width: 200, height: 100 }, maximized: false };
    expect(restorableBounds(saved, [display])).toMatchObject(MIN_SIZE);
  });
});
