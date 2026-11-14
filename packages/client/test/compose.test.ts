import { describe, expect, it } from "vitest";
import type { SessionId, TopicId } from "@rivethub/contracts";
import { createClient } from "../src/index.js";
import { sessionSegment } from "../src/rh/util.js";
import * as body from "./bodies.js";
import { fakeRh, offline } from "./fake.js";

const SID = "claude-code:s-1" as SessionId;
const seg = sessionSegment(SID);

const liveRoutes = {
  "GET /api/topics": body.topicsBody,
  "GET /api/harnesses": body.harnessesBody,
  "GET /api/harness-sessions/previews": { previews: [] },
  "GET /api/memory/summaries/probe": { sessionId: "probe", summaries: [] },
  "GET /api/topics/search?q=probe": { topics: [] },
  "GET /api/topics/filing": body.filingBody,
  "GET /api/harnesses/claude-code/sessions": body.claudeSessionsBody,
  [`GET /api/harness-sessions/${seg}`]: body.sessionSummaryBody,
  [`GET /api/sessions/${seg}/placement`]: { placement: null },
  [`GET /api/sessions/${seg}/visibility`]: { sessionId: SID, visibility: "private" },
  "GET /api/sessions/trash": { candidates: [] },
};

describe("createClient", () => {
  it("reports sample for every capability when the runtime has no routes", async () => {
    const client = createClient({ baseUrl: "https://rh.test", fetch: fakeRh({}).fetch });
    const caps = await client.capabilities();
    expect(Object.values(caps).every((value) => value === "sample")).toBe(true);
    expect((await client.topicTree()).map((node) => node.name)).toContain("RivetHub");
  });

  it("reports sample and serves the sample world when the runtime is unreachable", async () => {
    const client = createClient({ baseUrl: "https://rh.test", fetch: offline });
    expect(Object.values(await client.capabilities()).every((value) => value === "sample")).toBe(true);
    expect((await client.sessions({})).items.length).toBeGreaterThan(5);
    expect(await client.reviewQueue()).not.toHaveLength(0);
  });

  it("marks only the capabilities whose routes answer as live and delegates accordingly", async () => {
    const fake = fakeRh({ "GET /api/topics": body.topicsBody });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    const caps = await client.capabilities();
    expect(caps.topics).toBe("live");
    expect(caps.sessions).toBe("sample");
    expect(caps.review).toBe("sample");
    const tree = await client.topicTree();
    expect(tree.map((node) => node.name)).toEqual(["RivetHub", "Home lab"]);
    expect((await client.sessions({})).items.some((row) => row.id === "claude-code:retention")).toBe(true);
  });

  it("falls back to sample for one call when a live route disappears mid-session", async () => {
    let topicsUp = true;
    const fake = fakeRh({ ...liveRoutes, "GET /api/topics": () => (topicsUp ? body.topicsBody : { status: 404, body: { error: "not found" } }) });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    expect((await client.capabilities()).topics).toBe("live");
    expect((await client.topicTree()).map((node) => node.name)).toEqual(["RivetHub", "Home lab"]);
    topicsUp = false;
    expect((await client.topicTree()).map((node) => node.name)).toContain("Omarchy setup");
  });

  it("still surfaces a real error from a live route", async () => {
    const fake = fakeRh({ ...liveRoutes, "GET /api/topics/t-a/page": { status: 500, body: { error: "boom" } }, "GET /api/topics/t-a/decisions": { decisions: [] }, "GET /api/topics/t-a/sessions": { sessions: [] } });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    await expect(client.topic("t-a" as TopicId)).rejects.toMatchObject({ name: "HttpError", status: 500 });
  });

  it("marks message counts as unknown on a runtime without the session catalog, so no session reads as empty", async () => {
    const client = createClient({ baseUrl: "https://rh.test", fetch: fakeRh(liveRoutes).fetch });
    const { items } = await client.sessions({});
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((row) => row.messageCountUnknown === true)).toBe(true);
    expect((await client.session(SID)).messageCountUnknown).toBe(true);
  });

  it("keeps UI trash out of live lists without deleting anything on the runtime", async () => {
    const fake = fakeRh(liveRoutes);
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    expect((await client.capabilities()).sessions).toBe("live");
    await client.trash([SID]);
    expect((await client.sessions({})).items.some((row) => row.id === SID)).toBe(false);
    const trash = (await client.sessions({ view: "trash" })).items;
    expect(trash).toEqual([expect.objectContaining({ id: SID, trashed: true })]);
    expect(fake.calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("sends keep to the runtime and returns the session to live lists", async () => {
    const fake = fakeRh({ ...liveRoutes, [`PUT /api/sessions/${seg}/keep`]: { status: 204, body: null } });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    await client.capabilities();
    await client.trash([SID]);
    await client.keep(SID, true);
    expect((await client.sessions({})).items.some((row) => row.id === SID)).toBe(true);
    expect(fake.calls.at(-1)).toMatchObject({ method: "GET" });
    expect(fake.calls.some((call) => call.method === "PUT" && call.path.endsWith("/keep"))).toBe(true);
  });
});

describe("first calls do not wait on probes", () => {
  /** A fake rh that holds every answer until `open()`, so a test can see what was sent while the probes were out. */
  function gated(routes: Parameters<typeof fakeRh>[0]) {
    const inner = fakeRh(routes);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const fetch: typeof inner.fetch = async (input, init) => {
      const response = inner.fetch(input, init);
      await gate;
      return response;
    };
    return { fetch, calls: inner.calls, open };
  }
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const sent = (calls: { method: string; path: string }[], method: string, path: string) => calls.filter((c) => c.method === method && c.path === path).length;

  it("sends a read at once and takes its answer as proof the capability is live, with no probe of the same route", async () => {
    const rh = gated({ "GET /api/topics": body.topicsBody });
    const client = createClient({ baseUrl: "https://rh.test", fetch: rh.fetch });
    const tree = client.topicTree();
    const caps = client.capabilities();
    await tick();
    expect(sent(rh.calls, "GET", "/api/topics")).toBe(1);
    rh.open();
    expect((await tree).map((node) => node.name)).toEqual(["RivetHub", "Home lab"]);
    expect((await caps).topics).toBe("live");
    expect(sent(rh.calls, "GET", "/api/topics")).toBe(1);
  });

  it("serves the sample world when a read fails on a hub that lacks the capability", async () => {
    // The page route answers 500, but nothing this hub has says it serves topics at all.
    const rh = fakeRh({ "GET /api/topics/t-a/page": { status: 500, body: { error: "boom" } } });
    const client = createClient({ baseUrl: "https://rh.test", fetch: rh.fetch });
    const [first] = await client.topicTree();
    await expect(client.topic(first!.id)).resolves.toMatchObject({ id: first!.id });
  });

  it("keeps a real error real once a read has shown the capability is there, even if the probe would now fail", async () => {
    // The tree answers once. After that the list route cannot be reached, and the page route answers 500.
    const inner = fakeRh({
      "GET /api/topics": body.topicsBody,
      "GET /api/topics/t-a/page": { status: 500, body: { error: "boom" } },
      "GET /api/topics/t-a/decisions": { decisions: [] },
      "GET /api/topics/t-a/sessions": { sessions: [] },
    });
    let listUp = true;
    const fetch: typeof inner.fetch = async (input, init) => {
      if (!listUp && new URL(input).pathname === "/api/topics") {
        await tick();
        throw new TypeError("fetch failed");
      }
      return inner.fetch(input, init);
    };
    const client = createClient({ baseUrl: "https://rh.test", fetch });
    expect((await client.topicTree()).map((node) => node.name)).toEqual(["RivetHub", "Home lab"]);
    listUp = false;
    await expect(client.topic("t-a" as TopicId)).rejects.toMatchObject({ name: "HttpError", status: 500 });
    expect((await client.capabilities()).topics).toBe("live");
  });

  it("holds a write until its capability is known, and never sends it to a hub without the capability", async () => {
    const live = gated({ "GET /api/topics": body.topicsBody, "PATCH /api/topics/t-a": { status: 204, body: null } });
    const client = createClient({ baseUrl: "https://rh.test", fetch: live.fetch });
    const write = client.updateTopic("t-a" as TopicId, { name: "Renamed" });
    await tick();
    expect(live.calls.filter((c) => c.method !== "GET")).toEqual([]);
    live.open();
    await write;
    expect(sent(live.calls, "PATCH", "/api/topics/t-a")).toBe(1);

    const bare = fakeRh({});
    const offHub = createClient({ baseUrl: "https://rh.test", fetch: bare.fetch });
    const [first] = await offHub.topicTree();
    await offHub.updateTopic(first!.id, { name: "Renamed" });
    expect(bare.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("probes each capability on its own, so a slow one does not hold up the rest", async () => {
    let releaseToday!: () => void;
    const slow = new Promise<void>((resolve) => (releaseToday = resolve));
    const inner = fakeRh({ "GET /api/topics": body.topicsBody });
    const client = createClient({
      baseUrl: "https://rh.test",
      fetch: async (input, init) => {
        if (new URL(input).pathname === "/api/today") await slow;
        return inner.fetch(input, init);
      },
    });
    expect((await client.topicTree()).map((node) => node.name)).toEqual(["RivetHub", "Home lab"]);
    releaseToday();
  });
});
