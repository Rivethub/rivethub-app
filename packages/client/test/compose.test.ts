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
