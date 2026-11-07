import { describe, expect, it } from "vitest";
import { visibilityFromWire } from "../src/rh/util.js";

describe("visibilityFromWire", () => {
  it("reads the tagged object the 0.8 runtime sends", () => {
    expect(visibilityFromWire({ kind: "private" })).toEqual({ kind: "private" });
    expect(visibilityFromWire({ kind: "space", space: "household" })).toEqual({ kind: "space", space: "household" });
  });
  it("still reads the string form older routes send", () => {
    expect(visibilityFromWire("private")).toEqual({ kind: "private" });
    expect(visibilityFromWire("household")).toEqual({ kind: "space", space: "household" });
    expect(visibilityFromWire(undefined)).toEqual({ kind: "private" });
  });
});
