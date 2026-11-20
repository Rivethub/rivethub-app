import { describe, expect, it } from "vitest";
import { passageExcerpt, sectionHeading } from "./summary";

describe("section headings", () => {
  it("drop the transcript range the model wrote", () => {
    expect(sectionHeading("Brass pipe measurements [m00085-m00087]")).toBe("Brass pipe measurements");
    expect(sectionHeading("Brass pipe measurements")).toBe("Brass pipe measurements");
  });
});

describe("passage excerpts", () => {
  it("read as plain sentences", () => {
    const text = "## Brass pipe [m00001-m00004]\n\nThe pipe is 22 mm.\n\n## Valves [m00005-m00009]\n\nTwo valves were swapped.";
    expect(passageExcerpt(text, "pipe")).toBe("Brass pipe The pipe is 22 mm. Valves Two valves were swapped.");
  });

  it("show the words around the first match in a long passage", () => {
    const filler = "Nothing about it here. ".repeat(60);
    const text = `${filler}The cask valve has a bypass that matters. ${filler}`;
    const excerpt = passageExcerpt(text, "cask bypass", 200);
    expect(excerpt).toContain("cask valve has a bypass");
    expect(excerpt.startsWith("… ")).toBe(true);
    expect(excerpt.endsWith(" …")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(206);
  });
});
