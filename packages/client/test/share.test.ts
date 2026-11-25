import { describe, expect, it, vi } from "vitest";
import { createShareClient } from "../src/share/index.js";
import { createRhClient } from "../src/rh/index.js";
import { HttpError, ReauthRequiredError, RouteMissingError } from "../src/errors.js";
import { fakeRh, noContent } from "./fake.js";

const SESSION = "0b8f6c2e-3d7a-4c59-9d57-6a1d2f0e4b11";
const CODE = "rivethub:drop/AbCdEfGhIjKlMnOpQrStUv#SECRETKEYMATERIAL";

const report = {
  draft: "d-1",
  expires_at: "2026-11-12T10:00:00Z",
  totals: { secrets: 1, mapped: 0, redacted: 2, escaped: 0, rechecked: 0 },
  rules: [{ rule: "aws-key", count: 1 }],
  sessions: [{ id: SESSION, agent: "claude-code", messages: 12 }],
  not_scanned: "Images and binary attachments are not scanned.",
  best_effort: "Best effort: review the flags.",
  flags: [
    { number: 1, score: 0.9, session: SESSION, place: { session: 1, message: 3, field: "tool_result", more: 2 }, length: 14, text: "<U+202E>token", state: { kind: "open" } },
    { number: 2, score: 0.4, length: 5, text: "alex", state: { kind: "map", term: "alex", placeholder: "PERSON_1" } },
  ],
};

function client(routes: Parameters<typeof fakeRh>[0], auth?: Parameters<typeof createShareClient>[0]["auth"]) {
  const fake = fakeRh(routes);
  return { share: createShareClient({ baseUrl: "http://127.0.0.1:5174", fetch: fake.fetch, ...(auth ? { auth } : {}) }), calls: fake.calls };
}

describe("share client", () => {
  it("sends decisions in rh's shape and reads the report with escaped flag text", async () => {
    const { share, calls } = client({ "POST /api/share/drafts": { status: 201, body: report } });
    const draft = await share.createDraft(
      [
        { id: SESSION, decision: { kind: "redact", terms: ["alex"], dropToolOutputs: true } },
        { id: "other", decision: { kind: "approve" } },
      ],
      { decide: true },
    );
    expect(calls[0]!.body).toEqual({
      decide: true,
      sessions: [
        { id: SESSION, decision: "redact", redact: { terms: ["alex"], drop_tool_outputs: true } },
        { id: "other", decision: "approve" },
      ],
    });
    expect(draft.bestEffort).toBe("Best effort: review the flags.");
    expect(draft.flags[0]).toMatchObject({ number: 1, text: "<U+202E>token", state: { kind: "open" }, place: { session: 1, message: 3, field: "tool_result", more: 2 } });
    expect(draft.flags[1]!.state).toEqual({ kind: "map", term: "alex", placeholder: "PERSON_1" });
  });

  it("keeps the share code in request bodies and out of every path", async () => {
    const importReply = { bundle: "b-1", receivedAt: "2026-11-12T10:00:00Z", author: "alex", verification: "verified", imported: [], skipped: [2] };
    const { share, calls } = client({
      "POST /api/share/receive": () => ({ bundle: "b-1", server: "http://127.0.0.1:61522", downloaded: true, author: "alex", node: "n", verification: "verified", reason: "ok", sessions: [], authorFindings: 0, authorRows: [], summary: "", held: false }),
      "POST /api/share/receive/import": importReply,
    });
    await share.receive(CODE);
    await share.importReceived(CODE, { choices: [{ n: 2, decision: "skip" }] });
    expect(calls.map((call) => call.path)).toEqual(["/api/share/receive", "/api/share/receive/import"]);
    expect(calls.every((call) => !call.path.includes("SECRETKEYMATERIAL"))).toBe(true);
    expect(calls[1]!.body).toEqual({ code: CODE, sessions: [{ n: 2, decision: "skip" }] });
  });

  it("maps refusals to the reason, a stale login to ReauthRequiredError and an old rh to RouteMissingError", async () => {
    const { share } = client({
      "POST /api/share/receive": { status: 409, body: { error: "already received", reason: "already_received" } },
      "POST /api/share/receive/import": { status: 409, body: { error: "decide each flagged session", reason: "undecided", sessions: [2, 3] } },
      "POST /api/share/trust": { status: 401, body: { error: "reauth_required" } },
    });
    await expect(share.receive(CODE)).rejects.toMatchObject({ status: 409, code: "already_received" });
    await expect(share.importReceived(CODE, { choices: [] })).rejects.toMatchObject({ code: "undecided", sessions: [2, 3] });
    await expect(share.trust("alex", "ed25519:AAAA")).rejects.toBeInstanceOf(ReauthRequiredError);
    await expect(share.key()).rejects.toBeInstanceOf(RouteMissingError);
    await expect(share.receive(CODE)).rejects.toBeInstanceOf(HttpError);
  });

  it("sends the auth seam's headers on every request and calls onUnauthorized on a plain 401", async () => {
    const onUnauthorized = vi.fn();
    const seen: Headers[] = [];
    const share = createShareClient({
      baseUrl: "http://127.0.0.1:5174",
      auth: { headers: () => ({ "x-rh-csrf": "csrf-1" }), onUnauthorized },
      fetch: async (_input, init) => {
        seen.push(new Headers(init?.headers));
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
      },
    });
    await expect(share.servers()).rejects.toMatchObject({ status: 401 });
    expect(seen[0]!.get("x-rh-csrf")).toBe("csrf-1");
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("applies the same seam to the memory client", async () => {
    const seen: string[] = [];
    const rh = createRhClient({
      baseUrl: "http://127.0.0.1:5174",
      auth: { headers: () => ({ "x-rh-csrf": "csrf-2" }) },
      fetch: async (_input, init) => {
        seen.push(new Headers(init?.headers).get("x-rh-csrf") ?? "");
        return new Response(JSON.stringify({ topics: [] }), { status: 200 });
      },
    });
    await rh.methods.topicTree!();
    expect(seen).toEqual(["csrf-2"]);
  });

  it("reads each server's hub and the cloud policy, and treats an rh without the policy as cloud on", async () => {
    const { share } = client({
      "GET /api/share/servers": {
        servers: [
          { origin: "https://hub.example.org", kind: "team", hub: "acme", user: "phil", signed_in: true, default: true },
          { origin: "https://drop.example.org", kind: "team", signed_in: false, default: false },
        ],
        logins_file: "logins.json",
        token_store: "keyring",
        cloud_disabled: true,
      },
    });
    expect(await share.servers()).toEqual({
      tokenStore: "keyring",
      cloudDisabled: true,
      servers: [
        { origin: "https://hub.example.org", kind: "team", hub: "acme", user: "phil", signedIn: true, default: true },
        { origin: "https://drop.example.org", kind: "team", signedIn: false, default: false },
      ],
    });
    const older = client({ "GET /api/share/servers": { servers: [], token_store: "file" } });
    expect((await older.share.servers()).cloudDisabled).toBe(false);
  });

  it("lists ready bundles and drops a row it cannot read", async () => {
    const { share } = client({
      "GET /api/share/bundles": {
        bundles: [
          { name: "retention-2026-11", sessions: 3, bytes: 18432, open_flags: 2, created_at: "2026-11-20T09:30:00Z", sanitized: true },
          { name: "broken", sessions: "three" },
        ],
      },
    });
    expect(await share.bundles()).toEqual([{ name: "retention-2026-11", sessions: 3, bytes: 18432, openFlags: 2, createdAt: "2026-11-20T09:30:00.000Z", sanitized: true }]);
  });

  it("opens a bundle as a draft and pushes the draft to a hub with the confirmed counts", async () => {
    const { share, calls } = client({
      "POST /api/share/drafts/from-bundle": { status: 201, body: report },
      "POST /api/share/drafts/d-1/push": { hub: "acme", user: "phil", sessions: 1, inserted: 40, skipped: 2 },
    });
    const draft = await share.draftFromBundle("retention-2026-11");
    expect(draft.draft).toBe("d-1");
    expect(draft.flags).toHaveLength(2);
    const pushed = await share.push("d-1", { hub: "acme", confirm: { sessions: 1, keptFlags: 0 } });
    expect(pushed).toEqual({ hub: "acme", user: "phil", sessions: 1, inserted: 40, skipped: 2 });
    expect(calls.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: "POST", path: "/api/share/drafts/from-bundle", body: { name: "retention-2026-11" } },
      { method: "POST", path: "/api/share/drafts/d-1/push", body: { hub: "acme", confirm: { sessions: 1, kept_flags: 0 } } },
    ]);
  });

  it("reads the account's cloud policy", async () => {
    const account = { updateSource: "github", channel: "stable", autoDownload: true, version: "0.8.19", crashReports: false, usageCounts: false };
    const off = createRhClient({ baseUrl: "http://127.0.0.1:5174", fetch: fakeRh({ "GET /api/account": { ...account, cloudDisabled: true } }).fetch });
    expect((await off.methods.account!()).cloudDisabled).toBe(true);
    const older = createRhClient({ baseUrl: "http://127.0.0.1:5174", fetch: fakeRh({ "GET /api/account": account }).fetch });
    expect((await older.methods.account!()).cloudDisabled).toBeUndefined();
  });

  it("discards a draft with DELETE and reads no body", async () => {
    const { share, calls } = client({ "DELETE /api/share/drafts/d-1": noContent });
    await share.discard("d-1");
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/api/share/drafts/d-1" });
  });
});
