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
  it("keeps the full matching passage and its locations", () => {
    const content = "Backup checks. ".repeat(30).trim();
    const passage = { id: "p-1", ordinal: 2 };
    const section = { id: "s-1", heading: "Verifying the backup", sourceFirst: 11, sourceLast: 20, rangeVerified: true };
    const source = { id: "m-1", sessionId: "codex:backup", agent: "test", channel: "codex", role: "assistant", content: "Invented source message." };
    const memory = wire.memorySearch.parse({ results: [
      { id: "p-1", source: "summary", kind: "part", sessionId: source.sessionId, content, passage, sections: [section], sources: [source] },
    ] });
    expect(mapSearch([], memory).passages).toMatchObject([{ text: content, passage, sections: [section], sources: [source] }]);
  });

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

describe("search finds entities", () => {
  it("offers an entity as an entity, a topic as a topic, and never a type", () => {
    const topics = wire.topicList.parse({
      topics: [
        { id: "e-1", kind: "entity", slug: "gpubox", name: "gpubox", aliases: ["gpubox-2"], parent: "t-hosts" },
        { id: "t-hosts", kind: "type", slug: "hosts", name: "Hosts", aliases: [] },
        { id: "t-1", kind: "work", slug: "home-lab", name: "Home lab", aliases: [], sessionCount: 3 },
      ],
    }).topics;
    const { goTo } = mapSearch(topics, wire.memorySearch.parse({ results: [] }));
    expect(goTo.map((hit) => [hit.subject.kind, hit.subject.title, hit.context])).toEqual([
      ["entity", "gpubox", "Entity · Also known as gpubox-2"],
      ["topic", "Home lab", "Topic · 3 sessions"],
    ]);
  });
});

describe("search ranks names", () => {
  it("puts the thing named exactly what was typed first, then names that start with it", () => {
    const topics = wire.topicList.parse({
      topics: [
        { id: "e-2", kind: "entity", slug: "ds41", name: "ds41-serve.service", aliases: [] },
        { id: "e-3", kind: "entity", slug: "gpubox-dash", name: "gpubox dashboard", aliases: [] },
        { id: "e-1", kind: "entity", slug: "gpubox", name: "gpubox", aliases: [] },
      ],
    }).topics;
    const { goTo } = mapSearch(topics, wire.memorySearch.parse({ results: [] }), "GPUbox ");
    expect(goTo.map((hit) => hit.subject.title)).toEqual(["gpubox", "gpubox dashboard", "ds41-serve.service"]);
  });
});
