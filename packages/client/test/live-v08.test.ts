import { describe, expect, it } from "vitest";
import type { EntityId, SessionId } from "@rivethub/contracts";
import { createClient } from "../src/index.js";
import { createRhClient } from "../src/rh/index.js";
import { sessionSegment } from "../src/rh/util.js";
import { HttpError, MalformedResponseError, RouteMissingError } from "../src/errors.js";
import * as body from "./bodies.js";
import { fakeRh, noContent } from "./fake.js";

const SID = "claude-code:s-1" as SessionId;
const seg = sessionSegment(SID);

function rh(routes: Parameters<typeof fakeRh>[0]) {
  const fake = fakeRh(routes);
  return { client: createRhClient({ baseUrl: "https://rh.test", fetch: fake.fetch }), calls: fake.calls };
}

const catalogRoutes = {
  "GET /api/sessions": body.catalogPageBody,
  [`GET /api/sessions/${seg}`]: body.catalogDetailBody,
};

describe("session catalog mapping", () => {
  it("maps rows with parent and child counts and reads visibility as a string", async () => {
    const { client, calls } = rh(catalogRoutes);
    const page = await client.methods.sessions!({ view: "kept", harness: "claude-code", text: " ", cursor: "c1" });
    expect(calls.at(-1)!.path).toBe("/api/sessions?view=kept&harness=claude-code&cursor=c1&limit=50");
    expect(page.next).toBe("1788685800000.claude-code:agent-7");
    expect(page.items[0]).toEqual({
      id: SID, title: "Wire the stream", harness: "claude-code", startedAt: "2026-11-06T09:00:00.000Z", endedAt: "2026-11-06T10:30:00.000Z",
      messageCount: 42, topic: { id: "t-b", path: ["RivetHub", "rh runtime"] }, visibility: { kind: "private" }, kept: true, trashed: false,
      memoryState: "summarized", gist: "Wired the capture stream.", childCount: 2,
    });
    expect(page.items[1]).toMatchObject({ parentId: SID, visibility: { kind: "space", space: "team-1" }, memoryState: "capturing" });
    expect(page.items[1]).not.toHaveProperty("childCount");
    expect(page.items[1]).not.toHaveProperty("endedAt");
  });

  it("maps a detail with cwd and resume command and empty changed, entities and tags", async () => {
    const { client } = rh(catalogRoutes);
    const detail = await client.methods.session!(SID);
    expect(detail).toMatchObject({ cwd: "/home/phil/rivethub", resumeCommand: "claude --resume s-1", changed: [], entities: [], tags: [], childCount: 2 });
  });

  it("preserves an unfamiliar memory state for display", async () => {
    const bad = { items: [{ ...body.catalogPageBody.items[0], memoryState: "done" }] };
    const { client } = rh({ "GET /api/sessions?limit=1": body.catalogPageBody, "GET /api/sessions": bad });
    expect((await client.methods.sessions!({})).items[0]).toMatchObject({ memoryState: "queued", memoryStateRaw: "done" });
  });

  it("calls trash, restore and un-keep on the reversible routes and never the permanent delete", async () => {
    const { client, calls } = rh({
      ...catalogRoutes,
      [`POST /api/sessions/${seg}/trash`]: noContent,
      [`POST /api/sessions/${seg}/restore`]: noContent,
      [`DELETE /api/sessions/${seg}/keep`]: noContent,
    });
    await client.methods.trash!([SID]);
    await client.methods.restore!([SID]);
    await client.methods.keep!(SID, false);
    expect(calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.path.split("/").at(-1)}`)).toEqual(["POST trash", "POST restore", "DELETE keep"]);
    expect(calls.some((call) => call.method === "DELETE" && call.path === `/api/sessions/${seg}`)).toBe(false);
  });

  it("reports a live session as 409 instead of hiding it", async () => {
    const { client } = rh({ ...catalogRoutes, [`POST /api/sessions/${seg}/trash`]: { status: 409, body: { error: "session is still running" } } });
    await expect(client.methods.trash!([SID])).rejects.toMatchObject({ name: "HttpError", status: 409 });
  });
});

describe("entities mapping", () => {
  it("maps the list and passes the type filter", async () => {
    const { client, calls } = rh({ "GET /api/entities": body.entityListBody });
    const list = await client.methods.entities!("machine");
    expect(calls[0]!.path).toBe("/api/entities?type=machine");
    expect(list).toEqual([
      { id: "nas-01", title: "nas-01", type: "machine", sessionCount: 3 },
      { id: "rh", title: "rh", type: "software", sessionCount: 9 },
    ]);
  });

  it("maps an article with facts, a conflict, a previous value, a timeline and object visibility on its sessions", async () => {
    const { client, calls } = rh({ "GET /api/entities/nas-01": body.entityArticleBody });
    const article = await client.methods.entity!("nas-01" as EntityId, "2026-11-05T00:00:00.000Z" as never);
    expect(calls[0]!.path).toBe("/api/entities/nas-01?asOf=2026-11-05T00%3A00%3A00.000Z");
    expect(article.visibility).toEqual({ kind: "space", space: "team-1" });
    expect(article.topic).toEqual({ id: "t-d", path: ["Home lab"] });
    expect(article.facts[0]).toMatchObject({ id: "f-1", pinned: true, previous: { value: "02:30", until: "2026-11-05T08:00:00.000Z" } });
    expect(article.facts[0]).not.toHaveProperty("conflict");
    expect(article.facts[1]!.conflict!.candidates.map((c) => c.value)).toEqual(["tank", "pool0"]);
    expect(article.timeline[0]).toMatchObject({ kind: "fact", source: { id: "claude-code:s-1", title: "Wire the stream" } });
    expect(article.timeline[1]).not.toHaveProperty("source");
    expect(article.connected).toEqual([{ id: "rh", title: "rh", sharedSessions: 2 }]);
    expect(article.sessions[0]).toMatchObject({ visibility: { kind: "private" }, memoryState: "summarized" });
    expect(article.tags).toEqual([{ key: "area", value: "storage", state: "suggested" }]);
    expect(article.freshness).toBe("live");
  });

  it("sends a fact edit without an id for a new fact", async () => {
    const { client, calls } = rh({ "PUT /api/entities/nas-01/facts": { id: "f-9", key: "k", value: "v", since: "2026-11-06T00:00:00Z", pinned: false, sources: [] } });
    await client.methods.setFact!("nas-01" as EntityId, { key: "k", value: "v", pinned: false });
    expect(calls[0]).toMatchObject({ method: "PUT", body: { key: "k", value: "v", pinned: false } });
    expect(calls[0]!.body).not.toHaveProperty("id");
  });
});

describe("a session received from someone else", () => {
  // The row rh 0.8.3 lists after `rh memory receive`: no harness, and an origin naming the sender.
  const received = {
    id: "import:081a50ae9fd1f5d566084b5fad68d3c191a3f65eb2b392c5cea4196b0ee42038",
    title: "Move the backups",
    origin: { author: "phil", createdAt: "2026-11-14T00:16:10.784407Z", updatedAt: "2026-11-14T00:16:11.081501Z", verification: "unknown_key", bundleId: "2ZdzlgbrmA_yHD4ZionG4w" },
    startedAt: "2026-11-14T00:16:10.784Z",
    endedAt: "2026-11-14T00:16:11.081Z",
    messageCount: 3,
    visibility: { kind: "private" },
    kept: false,
    trashed: false,
    memoryState: "queued",
  };
  const receivedSeg = sessionSegment(received.id as SessionId);

  it("lists it with its sender, under the shared harness", async () => {
    const { client } = rh({ "GET /api/sessions": { items: [received, ...body.catalogPageBody.items] } });
    const page = await client.methods.sessions!({});
    expect(page.items).toHaveLength(body.catalogPageBody.items.length + 1);
    expect(page.items[0]).toMatchObject({ id: received.id, harness: "shared", origin: { author: "phil", verification: "unknown_key" }, messageCount: 3 });
    expect(page.items[1]).not.toHaveProperty("origin");
  });

  it("addresses it by its key as it is, which is the only form rh accepts for a received session", () => {
    expect(receivedSeg).toBe(received.id);
    expect(sessionSegment("claude-code:s-1" as SessionId)).not.toContain(":");
    // Only a well-formed import key is passed through.
    expect(sessionSegment("import:not-a-digest" as SessionId)).not.toContain(":");
  });

  it("opens it", async () => {
    const { client, calls } = rh({ "GET /api/sessions": { items: [received] }, [`GET /api/sessions/${encodeURIComponent(received.id)}`]: { ...received, cwd: "/tmp/x", changed: [], entities: [], tags: [] } });
    expect(await client.methods.session!(received.id as SessionId)).toMatchObject({ harness: "shared", origin: { author: "phil" }, cwd: "/tmp/x" });
    expect(calls.at(-1)!.path).toBe(`/api/sessions/${encodeURIComponent(received.id)}`);
  });

  it("retains an unfamiliar verification value and the sender", async () => {
    const { client } = rh({ "GET /api/sessions": { items: [{ ...received, origin: { author: "phil", verification: "some-new-state" } }] } });
    expect((await client.methods.sessions!({})).items[0]!.origin).toEqual({ author: "phil", verification: "some-new-state" });
  });
});

describe("harnesses and models mapping", () => {
  it("maps capture status and drops absent optionals", async () => {
    const { client } = rh({ "GET /api/capture/status": body.captureStatusBody });
    const list = await client.methods.harnesses!();
    expect(list[0]).toMatchObject({ id: "claude-code", version: "2.1.0", capture: { method: "hook", state: "receiving", lastCaptureAt: "2026-11-06T10:30:00.000Z" }, recall: { state: "connected" }, canConnect: false });
    // rh says "stale" for a tool that is set up and has captured nothing yet. With no last capture, that is idle, not stopped.
    expect(list[1]).toMatchObject({ capture: { method: "store-scan", state: "idle" }, canConnect: true });
    expect(list[1]).not.toHaveProperty("path");
    expect(list[1]!.capture).not.toHaveProperty("lastCaptureAt");
  });

  it("keeps stale for a tool that captured before and has stopped", async () => {
    const stopped = { ...body.captureStatusBody[1]!, capture: { method: "hook", state: "stale", lastCaptureAt: "2026-11-01T08:00:00Z", detail: "hook installed; last capture 2026-11-01T08:00:00Z" } };
    const { client } = rh({ "GET /api/capture/status": [stopped] });
    expect((await client.methods.harnesses!())[0]!.capture).toMatchObject({ state: "stale", lastCaptureAt: "2026-11-01T08:00:00.000Z" });
  });

  it("posts the part and dryRun and returns the diff", async () => {
    const { client, calls } = rh({ "POST /api/harnesses/codex/connect": body.connectOutcomeBody });
    expect(await client.methods.connectHarness!("codex", "capture", { dryRun: true })).toEqual(body.connectOutcomeBody);
    await client.methods.connectHarness!("codex", "recall");
    expect(calls.map((call) => call.body)).toEqual([{ part: "capture", dryRun: true }, { part: "recall", dryRun: false }]);
  });

  it("maps model jobs", async () => {
    const { client } = rh({ "GET /api/memory/models": body.modelJobsBody });
    const jobs = await client.methods.modelJobs!();
    expect(jobs.map((job) => [job.role, job.health, job.inheritsDefault])).toEqual([["default", "healthy", false], ["summarizer", "failing", false], ["wiki-writer", "slow", true]]);
    expect(jobs[1]).not.toHaveProperty("provider");
  });
});

const liveV08 = {
  ...catalogRoutes,
  "GET /api/topics": body.topicsBody,
  "GET /api/entities": body.entityListBody,
  "GET /api/capture/status": body.captureStatusBody,
  "GET /api/memory/models": body.modelJobsBody,
};

describe("createClient against a v0.8 hub", () => {
  it("marks entities, harnesses, models and sessions live and serves them", async () => {
    const fake = fakeRh(liveV08);
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    const caps = await client.capabilities();
    expect([caps.entities, caps.harnesses, caps.models, caps.sessions]).toEqual(["live", "live", "live", "live"]);
    expect((await client.entities()).map((e) => e.id)).toEqual(["nas-01", "rh"]);
    expect((await client.harnesses()).map((h) => h.id)).toEqual(["claude-code", "codex"]);
    expect((await client.modelJobs()).map((j) => j.role)).toEqual(["default", "summarizer", "wiki-writer"]);
    expect((await client.sessions({})).items[0]!.childCount).toBe(2);
    expect(fake.calls.some((call) => call.path.startsWith("/api/topics/filing"))).toBe(false);
  });

  it("trashes and restores through the reversible routes with no local hold", async () => {
    const fake = fakeRh({ ...liveV08, [`POST /api/sessions/${seg}/trash`]: noContent, [`POST /api/sessions/${seg}/restore`]: noContent });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    await client.trash([SID]);
    expect((await client.sessions({})).items.some((row) => row.id === SID)).toBe(true);
    await client.restore([SID]);
    expect(fake.calls.filter((call) => call.method === "POST").map((call) => call.path.split("/").at(-1))).toEqual(["trash", "restore"]);
  });

  it("un-keeps on the runtime", async () => {
    const fake = fakeRh({ ...liveV08, [`DELETE /api/sessions/${seg}/keep`]: noContent });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    await client.keep(SID, false);
    expect(fake.calls.at(-1)).toMatchObject({ method: "DELETE", path: `/api/sessions/${seg}/keep` });
  });

  it("surfaces a refusal to trash a running session", async () => {
    const fake = fakeRh({ ...liveV08, [`POST /api/sessions/${seg}/trash`]: { status: 409, body: { error: "running" } } });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    await expect(client.trash([SID])).rejects.toBeInstanceOf(HttpError);
  });
});

describe("createClient against today's 0.7.2 hub", () => {
  const old = {
    "GET /api/topics": body.topicsBody,
    "GET /api/harnesses": body.harnessesBody,
    "GET /api/topics/filing": body.filingBody,
    "GET /api/harnesses/claude-code/sessions": body.claudeSessionsBody,
    "GET /api/sessions/trash": { candidates: [] },
    [`GET /api/harness-sessions/${seg}`]: body.sessionSummaryBody,
    [`GET /api/sessions/${seg}/placement`]: { placement: null },
    [`GET /api/sessions/${seg}/visibility`]: { sessionId: SID, visibility: "private" },
  };

  it("keeps the client-side merge, sample entities, harnesses and models", async () => {
    const client = createClient({ baseUrl: "https://rh.test", fetch: fakeRh(old).fetch });
    const caps = await client.capabilities();
    expect([caps.sessions, caps.entities, caps.harnesses, caps.models]).toEqual(["live", "sample", "sample", "sample"]);
    expect((await client.sessions({})).items.some((row) => row.id === "claude-code:s-1")).toBe(true);
    expect((await client.harnesses()).length).toBeGreaterThan(0);
  });

  it("holds a trash locally, restores it locally, and sends nothing but reads", async () => {
    const fake = fakeRh(old);
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    await client.trash([SID]);
    expect((await client.sessions({})).items.some((row) => row.id === SID)).toBe(false);
    await client.restore([SID]);
    expect((await client.sessions({})).items.some((row) => row.id === SID)).toBe(true);
    expect(fake.calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("sample connectHarness previews a dry run without changing state", async () => {
    const client = createClient({ baseUrl: "https://rh.test", fetch: fakeRh({}).fetch });
    const before = await client.harnesses();
    const target = before.find((h) => h.canConnect)!;
    const preview = await client.connectHarness(target.id, "capture", { dryRun: true });
    expect(preview.backupPath).toBe("");
    expect(preview.diff).not.toBe("");
    expect(await client.harnesses()).toEqual(before);
  });
});

describe("missing routes", () => {
  it("a runtime without the catalog makes trash a missing route for the rh client", async () => {
    const { client } = rh({ "GET /api/sessions/trash": { candidates: [] } });
    await expect(client.methods.trash!([SID])).rejects.toBeInstanceOf(RouteMissingError);
  });
});
