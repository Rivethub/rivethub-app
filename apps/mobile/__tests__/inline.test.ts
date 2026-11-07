import { inlineSpans } from "../src/ui/inline";

describe("inline markdown", () => {
  it("splits code and bold out of plain text", () => {
    expect(inlineSpans("set `MAX_LEN=8` and **restart** now")).toEqual([
      { kind: "text", text: "set " },
      { kind: "code", text: "MAX_LEN=8" },
      { kind: "text", text: " and " },
      { kind: "strong", text: "restart" },
      { kind: "text", text: " now" },
    ]);
  });

  it("leaves unmatched markers as text", () => {
    expect(inlineSpans("a ` lone tick and **open")).toEqual([{ kind: "text", text: "a ` lone tick and **open" }]);
  });
});
