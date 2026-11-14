import { describe, expect, it } from "vitest";
import type { ReviewItemId, SessionId } from "@rivethub/contracts";
import { createClient } from "../src/index.js";
import { createRhClient } from "../src/rh/index.js";
import { HttpError, MalformedResponseError } from "../src/errors.js";
import { fakeRh, noContent } from "./fake.js";

const SID = "claude-code:s-1";
const source = { session: { id: SID, title: "Plan the cut" }, at: "2026-11-06T09:00:00Z", value: "10.0.0.5" };

/** Shaped like wire::gateway::review::ReviewItem. */
const conflictItem = {
  id: "conflict:nas-01:ip",
  group: "conflict",
  subject: { kind: "entity", id: "nas-01", title: "nas-01" },
  text: "ip",
  options: [
    { label: "10.0.0.5", value: "10.0.0.5", source },
    { label: "10.0.0.9", value: "10.0.0.9" },
  ],
  evidence: [{ session: { id: SID, title: "Plan the cut" }, at: "2026-11-06T09:00:00Z", quote: "the nas is at 10.0.0.5", highlight: "10.0.0.5" }],
  createdAt: "2026-11-06T09:05:00Z",
};
const filingItem = {
  id: "filing:s-2",
  group: "filing",
  subject: { kind: "session", id: SID, title: "Plan the cut" },
  text: "File under rh runtime",
  before: "Unfiled",
  after: "rh runtime",
  evidence: [],
  createdAt: "2026-11-06T09:06:00Z",
};

/** Shaped like wire::gateway::today::Change. */
const change = {
  kind: "fact",
  subject: { kind: "entity", id: "nas-01", title: "nas-01" },
  text: "ip is 10.0.0.5",
  at: "2026-11-06T09:00:00Z",
  actor: { kind: "capture", harness: "claude-code" },
  source: { kind: "session", id: SID, title: "Plan the cut" },
};

/** Shaped like wire::gateway::today::TodayDigest. */
const digest = {
  date: "2026-11-06",
  headline: "1 session captured.",
  summary: "Work on [rh runtime](/topics/t-b) and [nas-01](/entities/nas-01).",
  needsYou: [conflictItem],
  reviewCount: 2,
  entries: [
    {
      session: {
        id: SID, title: "Plan the cut", harness: "claude-code", startedAt: "2026-11-06T09:00:00Z", messageCount: 12, visibility: "private",
        kept: false, trashed: false, memoryState: "summarized",
      },
      changes: [change, { ...change, kind: "filed", actor: { kind: "categorizer" }, source: undefined }],
    },
  ],
  activityByDay: [{ date: "2026-11-05", level: 0 }, { date: "2026-11-06", level: 3 }],
  recentlyUpdated: [{ kind: "topic", id: "t-b", title: "rh runtime" }],
  freshness: "live",
};

/** Shaped like wire::gateway::account::Account, skip_serializing_none so absent fields are missing. */
const signedOut = {
  updateSource: "github", channel: "stable", autoDownload: true, version: "0.8.0", crashReports: true, usageCounts: false,
};
const signedIn = {
  ...signedOut, email: "phil@example.com", updateSource: "rivethub-cloud",
  pendingUpdate: { version: "0.8.1", notesUrl: "https://rivethub.cloud/notes/0.8.1" },
};
const hub = { id: "local", name: "This machine", kind: "local", url: "http://127.0.0.1:5174", online: true, detail: "6 harnesses", current: true };

function rh(routes: Parameters<typeof fakeRh>[0]) {
  const fake = fakeRh(routes);
  return { client: createRhClient({ baseUrl: "https://rh.test", fetch: fake.fetch }), calls: fake.calls };
}

describe("review", () => {
  it("maps the queue, keeping optional fields only when sent", async () => {
    const { client } = rh({ "GET /api/review": [conflictItem, filingItem] });
    const [conflict, filing] = await client.methods.reviewQueue!();
    expect(conflict).toEqual({
      id: "conflict:nas-01:ip",
      group: "conflict",
      subject: { kind: "entity", id: "nas-01", title: "nas-01" },
      text: "ip",
      options: [
        { label: "10.0.0.5", value: "10.0.0.5", source: { session: { id: SID, title: "Plan the cut" }, at: "2026-11-06T09:00:00.000Z", value: "10.0.0.5" } },
        { label: "10.0.0.9", value: "10.0.0.9" },
      ],
      evidence: [{ session: { id: SID, title: "Plan the cut" }, at: "2026-11-06T09:00:00.000Z", quote: "the nas is at 10.0.0.5", highlight: "10.0.0.5" }],
      createdAt: "2026-11-06T09:05:00.000Z",
    });
    expect(filing).toMatchObject({ group: "filing", before: "Unfiled", after: "rh runtime", evidence: [] });
    expect(filing).not.toHaveProperty("options");
  });

  it("retains an unfamiliar group with a safe fallback", async () => {
    const { client } = rh({ "GET /api/review": [{ ...filingItem, group: "mystery" }] });
    expect((await client.methods.reviewQueue!())[0]).toMatchObject({ group: "tidy", rawGroup: "mystery" });
  });

  it("decides through the client, percent-encoding the id and sending the decision as the wire enum", async () => {
    const fake = fakeRh({
      "GET /api/review": [conflictItem],
      "GET /api/today": digest,
      "POST /api/review/conflict%3Anas-01%3Aip/decision": noContent,
    });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    expect((await client.capabilities()).review).toBe("live");
    await client.decide("conflict:nas-01:ip" as ReviewItemId, { kind: "choose", value: "10.0.0.9" });
    expect(fake.calls.at(-1)).toEqual({ method: "POST", path: "/api/review/conflict%3Anas-01%3Aip/decision", body: { kind: "choose", value: "10.0.0.9" } });
  });

  it("surfaces an unprocessable decision as an error instead of falling back to the sample", async () => {
    const fake = fakeRh({
      "GET /api/review": [conflictItem],
      "POST /api/review/filing%3As-2/decision": { status: 422, body: { error: "a filing suggestion has no options to choose from" } },
    });
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    await expect(client.decide("filing:s-2" as ReviewItemId, { kind: "choose", value: "x" })).rejects.toBeInstanceOf(HttpError);
  });
});

describe("today and changes", () => {
  it("maps the digest with its review items, session rows and changes", async () => {
    const { client, calls } = rh({ "GET /api/today": digest });
    const today = await client.methods.today!("2026-11-06");
    expect(calls.at(-1)!.path).toBe("/api/today?date=2026-11-06");
    expect(today).toMatchObject({
      date: "2026-11-06", headline: "1 session captured.", reviewCount: 2, freshness: "live",
      recentlyUpdated: [{ kind: "topic", id: "t-b", title: "rh runtime" }],
      activityByDay: [{ date: "2026-11-05", level: 0 }, { date: "2026-11-06", level: 3 }],
    });
    expect(today.summary).toContain("[nas-01](/entities/nas-01)");
    expect(today.needsYou[0]).toMatchObject({ id: "conflict:nas-01:ip", group: "conflict" });
    expect(today.entries[0]!.session).toMatchObject({ id: SID, visibility: { kind: "private" }, startedAt: "2026-11-06T09:00:00.000Z" });
    expect(today.entries[0]!.changes[0]).toEqual({
      kind: "fact", subject: { kind: "entity", id: "nas-01", title: "nas-01" }, text: "ip is 10.0.0.5", at: "2026-11-06T09:00:00.000Z",
      actor: { kind: "capture", harness: "claude-code" }, source: { kind: "session", id: SID, title: "Plan the cut" },
    });
    expect(today.entries[0]!.changes[1]).not.toHaveProperty("source");
  });

  it("asks for today and drops an unusable activity bucket", async () => {
    const { client, calls } = rh({ "GET /api/today": { ...digest, activityByDay: [{ date: "2026-11-06", level: 5 }] } });
    expect((await client.methods.today!()).activityByDay).toEqual([]);
    expect(calls.at(-1)!.path).toBe("/api/today");
  });

  it("queries changes by subject and window", async () => {
    const { client, calls } = rh({ "GET /api/changes": [change] });
    const found = await client.methods.changes!({ subject: "nas-01" as never, from: "2026-11-01T00:00:00.000Z" as never });
    expect(calls.at(-1)!.path).toBe("/api/changes?from=2026-11-01T00%3A00%3A00.000Z&subject=nas-01");
    expect(found).toHaveLength(1);
    expect(found[0]!.actor).toEqual({ kind: "capture", harness: "claude-code" });
  });
});

describe("account and hubs", () => {
  it("reads the spaces a person belongs to from /api/me", async () => {
    const { client, calls } = rh({
      "GET /api/me": { user: "owner", settings: { defaultVisibility: "private", chosen: true }, spaces: [{ id: "household", kind: "household", name: "Household" }] },
    });
    expect(await client.methods.me!()).toEqual({
      user: "owner",
      settings: { defaultVisibility: "private", chosen: true },
      spaces: [{ id: "household", kind: "household", name: "Household" }],
    });
    expect(calls.at(-1)!.path).toBe("/api/me");
  });

  it("maps a signed-out account without an email and a signed-in one with a pending update", async () => {
    const signed = rh({ "GET /api/account": signedIn }).client;
    const out = rh({ "GET /api/account": signedOut }).client;
    expect(await out.methods.account!()).toEqual(signedOut);
    expect(await signed.methods.account!()).toEqual(signedIn);
  });

  it("patches settings and signs out and deletes through the account routes", async () => {
    const { client, calls } = rh({
      "PATCH /api/account": signedIn,
      "POST /api/account/signout": signedOut,
      "DELETE /api/account": signedOut,
    });
    await client.methods.updateAccount!({ channel: "beta" });
    expect(calls.at(-1)).toEqual({ method: "PATCH", path: "/api/account", body: { channel: "beta" } });
    expect(await client.methods.signOut!()).toEqual(signedOut);
    expect(await client.methods.deleteAccount!()).toEqual(signedOut);
  });

  it("starts a sign-in and polls from pending to signed-in", async () => {
    let polls = 0;
    const { client, calls } = rh({
      "POST /api/account/signin": { requestId: "req-1" },
      "POST /api/account/signin/poll": () => (++polls < 3 ? { status: "pending" } : { status: "signed-in", account: signedIn }),
    });
    expect(await client.methods.signIn!("phil@example.com")).toEqual({ requestId: "req-1" });
    expect(calls.at(-1)!.body).toEqual({ email: "phil@example.com" });
    expect(await client.methods.pollSignIn!()).toEqual({ status: "pending" });
    expect(await client.methods.pollSignIn!()).toEqual({ status: "pending" });
    expect(await client.methods.pollSignIn!()).toEqual({ status: "signed-in", account: signedIn });
  });

  it("reports an invalid email as an error", async () => {
    const { client } = rh({ "POST /api/account/signin": { status: 400, body: { error: "that is not an email address" } } });
    await expect(client.methods.signIn!("nope")).rejects.toMatchObject({ status: 400 });
  });

  it("maps hubs", async () => {
    const { client } = rh({ "GET /api/hubs": [hub, { ...hub, id: "team", kind: "team", current: false, online: false }] });
    expect((await client.methods.hubs!()).map((h) => [h.id, h.kind, h.current])).toEqual([["local", "local", true], ["team", "team", false]]);
  });
});

describe("capabilities", () => {
  const routes = { "GET /api/today": digest, "GET /api/review": [], "GET /api/account": signedOut, "GET /api/hubs": [hub] };

  it("marks today, review, account and hubs live when the routes answer", async () => {
    const caps = await createClient({ baseUrl: "https://rh.test", fetch: fakeRh(routes).fetch }).capabilities();
    expect([caps.today, caps.review, caps.account, caps.hubs]).toEqual(["live", "live", "live", "live"]);
  });

  it("serves the sample world on an older hub and never writes", async () => {
    const fake = fakeRh({});
    const client = createClient({ baseUrl: "https://rh.test", fetch: fake.fetch });
    const caps = await client.capabilities();
    expect([caps.today, caps.review, caps.account, caps.hubs]).toEqual(["sample", "sample", "sample", "sample"]);
    expect((await client.today()).freshness).toBe("sample");
    const queue = await client.reviewQueue();
    await client.decide(queue[0]!.id, { kind: "later" });
    await client.signIn("a@b.co");
    expect((await client.pollSignIn()).status).toBe("signed-in");
    expect(fake.calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("falls back to the sample for changes when only today is served without the route", async () => {
    const client = createClient({ baseUrl: "https://rh.test", fetch: fakeRh({ "GET /api/today": digest }).fetch });
    expect(await client.changes({ subject: SID as SessionId })).toBeInstanceOf(Array);
  });
});
