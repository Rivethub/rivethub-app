import { describe, expect, it } from "vitest";
import type { SessionId, TopicId } from "@rivethub/contracts";
import { createRhClient } from "../src/rh/index.js";
import { sessionSegment } from "../src/rh/util.js";
import { HttpError, MalformedResponseError, RouteMissingError } from "../src/errors.js";
import * as body from "./bodies.js";
import { fakeRh, noContent } from "./fake.js";

const SID = "claude-code:s-1" as SessionId;
const seg = sessionSegment(SID);

function rh(routes: Parameters<typeof fakeRh>[0]) {
  const fake = fakeRh(routes);
  return { client: createRhClient({ baseUrl: "https://rh.test/", fetch: fake.fetch }).methods, calls: fake.calls };
}

describe("topics", () => {
  it("nests the flat list by parent and reads closed topics as closed", async () => {
    const { client } = rh({ "GET /api/topics": body.topicsBody });
    const tree = await client.topicTree!();
    expect(tree.map((node) => node.name)).toEqual(["RivetHub", "Home lab"]);
    const runtime = tree[0]!.children[0]!;
    expect(runtime.name).toBe("rh runtime");
    expect(runtime.parentId).toBe("t-a");
    expect(runtime.children[0]).toMatchObject({ name: "Capture hooks", status: "closed", sessionCount: 1 });
    expect(runtime.children[0]!.lastActivity).toBe("2026-11-06T12:00:00.000Z");
  });

  it("assembles an article from page, decisions, sessions and the topic list", async () => {
    const { client } = rh({
      "GET /api/topics": body.topicsBody,
      "GET /api/topics/t-b/page": body.topicPageBody,
      "GET /api/topics/t-b/decisions": body.decisionsBody,
      "GET /api/topics/t-b/sessions": body.topicSessionsBody,
    });
    const article = await client.topic!("t-b" as TopicId);
    expect(article.path.map((step) => step.name)).toEqual(["RivetHub", "rh runtime"]);
    expect(article.lead).toBe("The Rust gateway and its workers.");
    expect(article.current).toBe("The gateway serves topics and memory.");
    expect(article.subtopics).toEqual([{ id: "t-c", name: "Capture hooks", state: "closed" }]);
    expect(article.decisions.map((d) => [d.text, d.superseded])).toEqual([
      ["Keep one gateway surface.", false],
      ["Keep the plug-in host.", true],
    ]);
    expect(article.decisions[0]!.source).toEqual({ id: "claude-code:s-1", title: "Wire the stream" });
    expect(article.sessions[0]).toMatchObject({ harness: "claude-code", topic: { path: ["RivetHub", "rh runtime"] } });
    expect(article.entities).toEqual([{ id: "e-1", title: "gateway" }]);
    expect(article.tags.map((tag) => tag.value)).toEqual(["rust", "gateway"]);
    expect(article.freshness).toBe("live");
  });

  it("maps visibility strings to private or a space", async () => {
    const { client } = rh({
      "GET /api/topics": body.topicsBody,
      "GET /api/topics/t-c/page": { ...body.topicPageBody, topic: body.topicsBody.topics[2] },
      "GET /api/topics/t-c/decisions": { decisions: [] },
      "GET /api/topics/t-c/sessions": { sessions: [] },
    });
    const article = await client.topic!("t-c" as TopicId);
    expect(article.visibility).toEqual({ kind: "space", space: "team-1" });
    expect(article.folder).toBe("~/hooks");
  });

  it("sends the topic mutations the runtime expects", async () => {
    const { client, calls } = rh({
      "PATCH /api/topics/t-b": body.topicsBody.topics[1],
      "POST /api/topics/t-b/decisions": { status: 201, body: body.decisionsBody.decisions[0] },
    });
    await client.updateTopic!("t-b" as TopicId, { name: "Runtime", parentId: null, folder: "~/rt" });
    await client.addDecision!("t-b" as TopicId, "Ship it.");
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { name: "Runtime", parent: null, directory: { kind: "shared", path: "~/rt" } } });
    expect(calls[1]).toMatchObject({ method: "POST", path: "/api/topics/t-b/decisions", body: { text: "Ship it." } });
  });
});

describe("sessions", () => {
  const listing = {
    "GET /api/topics": body.topicsBody,
    "GET /api/topics/filing": body.filingBody,
    "GET /api/harnesses": body.harnessesBody,
    "GET /api/harnesses/claude-code/sessions": body.claudeSessionsBody,
  };

  it("merges placed sessions with each harness's own list and sorts newest first", async () => {
    const { client, calls } = rh(listing);
    const page = await client.sessions!({});
    expect(page.items.map((row) => row.id)).toEqual(["claude-code:s-1", "codex:s-2", "claude-code:s-3"]);
    expect(page.items[0]).toMatchObject({ topic: { id: "t-b", path: ["RivetHub", "rh runtime"] }, memoryState: "capturing" });
    expect(page.items[2]!.topic).toBeUndefined();
    expect(calls.some((call) => call.path === "/api/harnesses/hermes/sessions")).toBe(false);
  });

  it("filters unfiled sessions and by harness", async () => {
    const { client } = rh(listing);
    expect((await client.sessions!({ view: "unfiled" })).items.map((row) => row.id)).toEqual(["claude-code:s-3"]);
    expect((await client.sessions!({ harness: "codex" })).items.map((row) => row.id)).toEqual(["codex:s-2"]);
    expect((await client.sessions!({ text: "hook" })).items.map((row) => row.id)).toEqual(["codex:s-2"]);
  });

  it("lists the runtime's trash candidates for the trash view", async () => {
    const { client } = rh({ ...listing, "GET /api/sessions/trash": body.trashBody });
    const page = await client.sessions!({ view: "trash" });
    expect(page.items).toEqual([expect.objectContaining({ id: "claude-code:s-9", trashed: true, title: "test" })]);
  });

  it("reads a session by its base64url segment and adds placement and visibility", async () => {
    const { client } = rh({
      "GET /api/topics": body.topicsBody,
      [`GET /api/harness-sessions/${seg}`]: body.sessionSummaryBody,
      [`GET /api/sessions/${seg}/placement`]: { placement: { sessionId: SID, topicId: "t-b", by: "you", at: 1 } },
      [`GET /api/sessions/${seg}/visibility`]: { sessionId: SID, visibility: "team-1" },
    });
    const detail = await client.session!(SID);
    expect(detail).toMatchObject({
      id: SID,
      harness: "claude-code",
      cwd: "~/rivethub-runtime",
      endedAt: "2026-11-06T10:00:00.000Z",
      topic: { path: ["RivetHub", "rh runtime"] },
      visibility: { kind: "space", space: "team-1" },
    });
  });

  it("maps transcript turns to text and tool parts, with times from milliseconds", async () => {
    const { client } = rh({ [`GET /api/harness-sessions/${seg}/transcript`]: body.transcriptBody });
    const turns = await client.transcript!(SID);
    expect(turns).toHaveLength(3);
    expect(turns[0]).toEqual({ index: 0, role: "user", at: "2026-11-06T09:00:00.000Z", parts: [{ kind: "text", text: "Wire the stream." }] });
    expect(turns[1]!.parts).toEqual([
      { kind: "tool", name: "Read", summary: "/src/stream.rs" },
      { kind: "tool", name: "Bash", summary: "failed" },
    ]);
    expect(await client.transcript!(SID, [2, 2])).toHaveLength(1);
  });

  it("rebuilds the summary tree from parent links with message ranges", async () => {
    const { client, calls } = rh({ [`GET /api/memory/summaries/${encodeURIComponent(SID)}`]: body.summariesBody });
    const tree = await client.summaryTree!(SID);
    expect(calls[0]!.path).toBe("/api/memory/summaries/claude-code%3As-1");
    expect(tree).toMatchObject({ level: "root", text: "The change stream was wired end to end.", messageRange: [0, 10] });
    const branch = tree.children[0]!;
    expect(branch).toMatchObject({ level: "branch", messageRange: [0, 10] });
    expect(branch.children.map((leaf) => [leaf.level, leaf.text, leaf.messageRange])).toEqual([
      ["leaf", "Read the stream code.", [0, 4]],
      ["leaf", "Wrote the event type.", [4, 10]],
    ]);
  });

  it("sends rename, visibility, keep and placement to the right routes", async () => {
    const { client, calls } = rh({
      [`PUT /api/harness-sessions/${seg}/title`]: body.sessionSummaryBody,
      [`PATCH /api/sessions/${seg}/visibility`]: { sessionId: SID, visibility: "private" },
      [`PUT /api/sessions/${seg}/keep`]: noContent,
      [`PUT /api/sessions/${seg}/placement`]: { placement: { sessionId: SID, topicId: "t-a", by: "you", at: 1 } },
      [`DELETE /api/sessions/${seg}/placement`]: {},
    });
    await client.renameSession!(SID, "New title");
    await client.setVisibility!(SID, { kind: "private" });
    await client.keep!(SID, true);
    await client.placeSession!(SID, "t-a" as TopicId);
    await client.placeSession!(SID, null);
    expect(calls.map((call) => [call.method, call.body])).toEqual([
      ["PUT", { title: "New title" }],
      ["PATCH", { visibility: "private" }],
      ["PUT", undefined],
      ["PUT", { topicId: "t-a" }],
      ["DELETE", undefined],
    ]);
  });

  it("has no un-keep route and says so", async () => {
    const { client } = rh({});
    await expect(client.keep!(SID, false)).rejects.toBeInstanceOf(RouteMissingError);
  });
});

describe("search", () => {
  it("returns topic hits then session hits and skips results without a session", async () => {
    const { client } = rh({
      "GET /api/topics/search?q=stream&limit=8": body.topicSearchBody,
      "GET /api/memory/search?q=stream&limit=30": body.memorySearchBody,
    });
    const results = await client.search!("  stream ");
    expect(results.goTo.map((hit) => [hit.subject.kind, hit.subject.title])).toEqual([
      ["topic", "RivetHub"],
      ["session", "Wire the stream"],
    ]);
    expect(results.goTo[1]).toMatchObject({ snippet: "Wired the stream end to end.", context: "summary" });
  });

  it("does not call the runtime for a blank query", async () => {
    const { client, calls } = rh({});
    expect(await client.search!("   ")).toEqual({ goTo: [], actions: [] });
    expect(calls).toHaveLength(0);
  });
});

describe("the boundary", () => {
  it("rejects a malformed body with a typed error naming the field", async () => {
    const { client } = rh({ "GET /api/topics": { topics: [{ id: "t-a", name: 5 }] } });
    const failure = await client.topicTree!().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MalformedResponseError);
    expect((failure as MalformedResponseError).issues).toContain("topics.0.name");
  });

  it("rejects an unparseable time", async () => {
    const bad = { topics: [{ ...body.topicsBody.topics[0], lastActive: "not a time" }] };
    const { client } = rh({ "GET /api/topics": bad });
    await expect(client.topicTree!()).rejects.toBeInstanceOf(MalformedResponseError);
  });

  it("tells a missing route from a missing resource", async () => {
    const asked = { "GET /api/topics": { topics: [] }, "GET /api/topics/t-x/decisions": { decisions: [] }, "GET /api/topics/t-x/sessions": { sessions: [] } };
    const resource = rh({ ...asked, "GET /api/topics/t-x/page": { status: 404, body: { error: "unknown topic t-x" } } });
    const missingResource = await resource.client.topic!("t-x" as TopicId).catch((error: unknown) => error);
    expect(missingResource).toBeInstanceOf(HttpError);
    expect((missingResource as HttpError).status).toBe(404);

    const route = rh(asked);
    await expect(route.client.topic!("t-x" as TopicId)).rejects.toBeInstanceOf(RouteMissingError);
  });

  it("probes which capabilities answer, counting a 400 as an answer and a bare 404 as absent", async () => {
    const fake = fakeRh({
      "GET /api/topics": { topics: [] },
      "GET /api/memory/summaries/probe": { status: 400, body: { error: "bad" } },
    });
    const live = await createRhClient({ baseUrl: "https://rh.test", fetch: fake.fetch }).probe();
    expect(live).toEqual({ topics: "live", "summary-tree": "live" });
  });
});
