import { describe, expect, it } from "vitest";
import { decideEmbed } from "./embed";

describe("decideEmbed", () => {
  it("is off unless a host bridge or embed=1 is present", () => {
    expect(decideEmbed({ host: false, embed: undefined })).toBe(false);
    expect(decideEmbed({ host: false, embed: "0" })).toBe(false);
    expect(decideEmbed({ host: false, embed: "" })).toBe(false);
  });

  it("is on for either trigger", () => {
    expect(decideEmbed({ host: true, embed: undefined })).toBe(true);
    expect(decideEmbed({ host: false, embed: "1" })).toBe(true);
    expect(decideEmbed({ host: false, embed: 1 })).toBe(true);
  });
});
