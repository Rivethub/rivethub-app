import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { descriptive, rows } from "../src/tolerant.js";
import * as wire from "../src/rh/wire.js";
import * as share from "../src/share/wire.js";
import { mapCatalogRow } from "../src/rh/catalog.js";
import { mapSearch } from "../src/rh/search.js";

const at = "2026-11-12T12:00:00Z";
const row = { id: "s", title: "Session", harness: "codex", owner: "Alex", startedAt: at, messageCount: 2, visibility: "private", kept: false, trashed: false, memoryState: "future" };
describe("open descriptive values", () => {
  it("preserves known and unknown labels and rejects non-string values", () => {
    const schema = descriptive(["known"]);
    expect(schema.parse("known")).toBe("known");
    expect(schema.parse("future")).toBe("future");
    expect(schema.safeParse(3).success).toBe(false);
  });
  it("drops unusable rows with a warning without logging private content", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rows(z.object({ id: z.string().min(1) })).parse([{ id: "a" }, { secret: "private" }, { id: "b" }])).toEqual([{ id: "a" }, { id: "b" }]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls.flat().join()).not.toContain("private");
    warn.mockRestore();
  });
  it.each(["organization", "project", "place", "future"])("accepts entity type %s and both story kinds", (type) => {
    const e = wire.entityArticle.parse({ id: "e", title: "Entity", type, sessionCount: 1, aliases: [], visibility: { kind: "private" }, lead: "Summary", facts: [], timeline: ["history", "future"].map((kind) => ({ at, text: "Story", kind, source: { id: "s", title: "Source" } })), connected: [], sessions: [], tags: [{ key: "x", value: "y", state: "future" }], freshness: "future" });
    expect(e.type).toBe(type);
    expect(e.timeline.map((t) => t.kind)).toEqual(["history", "future"]);
  });
  it("retains owner and unknown memory state through catalog and search mapping", () => {
    expect(mapCatalogRow(wire.catalogRow.parse(row))).toMatchObject({ owner: "Alex", memoryStateRaw: "future" });
    const memory = wire.memorySearch.parse({ results: [{ id: 1, sessionId: "s", owner: "Alex", content: "Words" }] });
    expect(mapSearch([], memory).passages?.[0]?.owner).toBe("Alex");
    expect(wire.memoryBrowse.parse({ messages: [{ id: 1, owner: "Alex" }] }).messages[0]?.owner).toBe("Alex");
  });
  it.each(["idle", "future"])("accepts capture state %s with future methods and recall states", (state) => {
    expect(wire.harnessStatusList.parse([{ id: "h", name: "Tool", found: true, canConnect: false, capture: { method: "future", state, detail: "" }, recall: { state: "future", detail: "" } }])[0]?.capture.state).toBe(state);
  });
  it("accepts future model names, health, review groups, change kinds, actors and hub kinds", () => {
    expect(wire.modelJobList.parse([{ role: "future", health: "future", inheritsDefault: false, queued: 0, detail: "" }])).toHaveLength(1);
    expect(wire.reviewList.parse([{ id: "r", group: "future", subject: { kind: "entity", id: "e", title: "E" }, text: "x", evidence: [], createdAt: at }])[0]?.group).toBe("future");
    expect(wire.changeList.parse([{ kind: "future", actor: { kind: "future" }, subject: { kind: "entity", id: "e", title: "E" }, text: "x", at }])).toHaveLength(1);
    expect(wire.hubList.parse([{ id: "h", name: "Hub", kind: "future", url: "", online: true, detail: "", current: true }])[0]?.kind).toBe("future");
    expect(wire.topicDecision.parse({ id: "d", text: "Decision", status: "future", createdAt: at }).status).toBe("future");
    expect(wire.transcriptTool.parse({ name: "Tool", status: "future" }).status).toBe("future");
    expect(share.serversReply.parse({ servers: [{ origin: "x", kind: "future", signed_in: false, default: false }], token_store: "future" }).tokenStore).toBe("future");
    expect(share.receiveReport.parse({ bundle: "b", server: "s", downloaded: true, author: "Alex", node: "n", verification: "future", reason: "", sessions: [], authorFindings: 0, authorRows: [], summary: "", held: true }).verification).toBe("future");
  });
  it("keeps access, transcript authorship, login and sanitizer decisions strict", () => {
    expect(wire.catalogRow.safeParse({ ...row, visibility: { kind: "future" } }).success).toBe(false);
    expect(wire.transcriptTurn.safeParse({ role: "future" }).success).toBe(false);
    expect(share.loginStep.safeParse({ state: "future" }).success).toBe(false);
  });
});

it("keeps arbitrary entity types and optional hub display names in the contract", () => {
  const entities = wire.entityList.parse([
    { id: "a", title: "Voyager", type: "spacecraft", sessionCount: 1 },
    { id: "b", title: "Notebook", type: "field-notes", typeName: "Field research notes", sessionCount: 2 },
  ]);
  expect(entities.map((e) => [e.type, e.typeName])).toEqual([["spacecraft", undefined], ["field-notes", "Field research notes"]]);
});
