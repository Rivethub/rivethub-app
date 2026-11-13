import { describe, expect, it } from "vitest";
import { createRhClient } from "../src/rh/index.js";
import { createUpkeepClient } from "../src/upkeep/index.js";
import { fakeRh, noContent } from "./fake.js";

const BASE = "http://127.0.0.1:5174";

describe("search options", () => {
  it("sends the window, scope and the hub's name for the match mode", async () => {
    const rh = fakeRh({ "GET /api/topics/search": { topics: [] }, "GET /api/memory/search": { results: [] } });
    const client = createRhClient({ baseUrl: BASE, fetch: rh.fetch });
    await client.methods.search!("backup", { window: "last_7d", scope: "summaries", mode: "fuzzy" });
    const query = new URL(BASE + rh.calls.find((c) => c.path.startsWith("/api/memory/search"))!.path).searchParams;
    expect(Object.fromEntries(query)).toMatchObject({ q: "backup", window: "last_7d", scope: "summaries", mode: "trigram" });
  });

  it("leaves the mode out for the default blend", async () => {
    const rh = fakeRh({ "GET /api/topics/search": { topics: [] }, "GET /api/memory/search": { results: [] } });
    await createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.search!("backup", { mode: "best" });
    expect(rh.calls.find((c) => c.path.startsWith("/api/memory/search"))!.path).not.toContain("mode=");
  });
});

describe("upkeep", () => {
  const stats = { conversations: 12, messages: 70, toolCalls: 17, summaries: 12, embedQueueDepth: 1, embeddedMessages: 69, failedEmbeddings: 0, topTools: [], recentSessions: [] };
  const upkeep = {
    filing: { categorizer: 9, you: 3, uncategorized: 1, leftOut: 2, correctionsLastWeek: 4 },
    wiki: { topicPages: 5, entityTypes: [{ typeId: "t1", name: "Hosts", entities: 4 }, { typeId: "t2", name: "People", entities: 0 }], loosePages: 1 },
    workers: { embedder: { lastFinishedAt: 1_762_000_000_000, failing: 0 }, summarizer: { failing: 2 }, categorizer: { failing: 0 }, wikiBuilder: { failing: 0 } },
    pendingProposals: 13,
  };

  it("merges the hub's stats and upkeep into one picture", async () => {
    const rh = fakeRh({ "GET /api/memory/stats": stats, "GET /api/memory/upkeep": upkeep });
    const got = await createUpkeepClient({ baseUrl: BASE, fetch: rh.fetch }).stats();
    expect(got).toMatchObject({
      sessions: 12,
      messages: 70,
      searchable: { embedded: 69, waiting: 1, failed: 0 },
      filing: { byCategorizer: 9, byYou: 3, notFiled: 1, leftOut: 2, correctionsLastWeek: 4 },
      wiki: { topicPages: 5, entities: 4, entityTypes: [{ name: "Hosts", count: 4 }], loosePages: 1 },
      toTidy: 13,
    });
    expect(got.workers).toEqual([
      { id: "embedder", failing: 0, lastFinishedAt: new Date(1_762_000_000_000).toISOString() },
      { id: "summarizer", failing: 2 },
      { id: "categorizer", failing: 0 },
      { id: "wiki-builder", failing: 0 },
    ]);
  });

  it("lists failed jobs by cause and retries or dismisses by the sample job's id", async () => {
    const rh = fakeRh({
      "GET /api/memory/flagged": { groups: [{ task: "compact-conversation", cause: "401 from the model", count: 3, lastFailedAt: 1_762_000_000_000, sample: { id: 41 } }] },
      "POST /api/memory/flagged/41/retry": noContent,
      "POST /api/memory/flagged/41/dismiss": noContent,
    });
    const client = createUpkeepClient({ baseUrl: BASE, fetch: rh.fetch });
    const [group] = await client.flagged();
    expect(group).toMatchObject({ id: "41", task: "compact-conversation", count: 3 });
    await client.retry(group!.id);
    await client.dismiss(group!.id);
    expect(rh.calls.slice(-2).map((c) => `${c.method} ${c.path}`)).toEqual(["POST /api/memory/flagged/41/retry", "POST /api/memory/flagged/41/dismiss"]);
  });
});
