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

describe("search passages", () => {
  it("keeps every match, in order, with where it came from", () => {
    const memory = wire.memorySearch.parse({
      results: [
        { id: 1, sessionId: "claude-code:s-1", title: "Debug vLLM", content: "a summary", source: "summary", createdAt: "2026-11-10T12:00:00Z" },
        { id: 2, sessionId: "claude-code:s-1", title: "Debug vLLM", content: "what you asked", source: "message", role: "user" },
        { id: 3, content: "a hit with no session is not a passage" },
      ],
      // What rh 0.8.3 sends from a node with no embedding model.
      degraded: { reason: "embedding endpoint not configured", effect: "Keyword / FTS ranking only — not meaning-based." },
    });
    const { passages, degraded } = mapSearch([], memory);
    expect(passages).toEqual([
      { id: "1", session: { id: "claude-code:s-1", title: "Debug vLLM" }, source: "summary", text: "a summary", at: "2026-11-10T12:00:00.000Z" },
      { id: "2", session: { id: "claude-code:s-1", title: "Debug vLLM" }, source: "message", text: "what you asked", role: "user" },
    ]);
    expect(degraded).toBe("Matched by words only: embedding endpoint not configured.");
    expect(mapSearch([], wire.memorySearch.parse({ results: [], degraded: true })).degraded).toBe("Matched by words only.");
    expect(mapSearch([], wire.memorySearch.parse({ results: [] })).degraded).toBeUndefined();
  });
});
