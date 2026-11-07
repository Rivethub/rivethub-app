import { describe, expect, it } from "vitest";
import { mapSearch } from "../src/rh/search.js";
import * as wire from "../src/rh/wire.js";

describe("search hits", () => {
  it("lists each session once with a plain-text snippet", () => {
    const memory = wire.memorySearch.parse({
      results: [
        { id: 1, sessionId: "claude-code:s-1", title: "Debug vLLM", content: "# vLLM build\n**Batch:** patched `sm70`" },
        { id: 2, sessionId: "claude-code:s-1", title: "Debug vLLM", content: "a second summary of the same session" },
        { id: 3, sessionId: "codex:s-2", title: "Bench", content: "plain" },
      ],
    });
    const { goTo } = mapSearch([], memory);
    expect(goTo.map((hit) => hit.subject.id)).toEqual(["claude-code:s-1", "codex:s-2"]);
    expect(goTo[0]!.snippet).toBe("vLLM build Batch: patched sm70");
  });
});
