import { describe, expect, it } from "vitest";
import { createClient } from "../src/compose.js";
import { createRhClient } from "../src/rh/index.js";
import * as wire from "../src/rh/wire.js";
import { catalogDetailBody, catalogPageBody } from "./bodies.js";
import { fakeRh } from "./fake.js";

const me = { user: "phil", spaces: [{ id: "space-1", kind: "team", name: "Engineering" }], settings: { defaultVisibility: "private", chosen: true } };
const tag = { id: "tag-1", key: "project", value: "e2e", state: "suggested" };
describe("hub membership and tag routes", () => {
  it("reads membership independently of account and hubs, preserving ids and names", async () => {
    const fake = fakeRh({ "GET /api/me": me });
    expect(await createClient({ baseUrl: "http://rh", fetch: fake.fetch }).me!()).toEqual(me);
    expect(fake.calls.map((c) => c.path)).toEqual(["/api/me"]);
    expect(() => wire.me.parse({ ...me, spaces: [{ name: "no id" }] })).toThrow();
    expect(() => wire.me.parse({ ...me, settings: { chosen: "yes" } })).toThrow();
  });
  it("never substitutes sample spaces when membership cannot be read", async () => {
    const fake = fakeRh({});
    await expect(createClient({ baseUrl: "http://rh", fetch: fake.fetch }).me!()).rejects.toThrow();
  });
  it("adds, accepts and rejects through HTTP, resolving the session's tag ids", async () => {
    const fake = fakeRh({
      "GET /api/memory/tags": { tags: [] },
      "POST /api/memory/tags/add": { tag: { ...tag, state: "accepted" } },
      "POST /api/memory/tags/lookup": { sessions: { "claude-code:s": [tag, { ...tag, id: "tag-2" }] } },
      "POST /api/memory/tags/decide": { changed: 2 },
    });
    const client = createClient({ baseUrl: "http://rh", fetch: fake.fetch });
    expect(await client.tagOperations!()).toEqual(["add", "accept", "reject"]);
    const id = "claude-code:s" as Parameters<typeof client.tag>[0];
    await client.tag(id, "project", "e2e", "add");
    await client.tag(id, "project", "e2e", "accept");
    await client.tag(id, "project", "e2e", "reject");
    expect(fake.calls.find((c) => c.path.endsWith("/add"))?.body).toEqual({ entity_type: "conversation", session_key: id, key: "project", value: "e2e" });
    expect(fake.calls.filter((c) => c.path.endsWith("/decide")).map((c) => c.body)).toEqual([
      { ids: ["tag-1", "tag-2"], state: "accepted" }, { ids: ["tag-1", "tag-2"], state: "rejected" },
    ]);
    await expect(client.tag(id, "project", "e2e", "remove")).rejects.toThrow("cannot remove");
  });
  it("hides tagging without a route and surfaces a failed write", async () => {
    const fake = fakeRh({ "POST /api/memory/tags/add": { status: 403, body: { error: "not your session" } } });
    const client = createClient({ baseUrl: "http://rh", fetch: fake.fetch });
    expect(await client.tagOperations!()).toEqual([]);
    await expect(client.tag("s" as Parameters<typeof client.tag>[0], "project", "e2e", "add")).rejects.toThrow("not your session");
  });
  it("validates tag responses and rename capabilities strictly", () => {
    expect(() => wire.tagAdded.parse({ tag: { ...tag, state: "unknown" } })).toThrow();
    expect(() => wire.tagLookup.parse({ sessions: { s: [{ key: "missing id" }] } })).toThrow();
    expect(() => wire.tagDecided.parse({ changed: -1 })).toThrow();
    expect(wire.harnessList.parse({ harnesses: [{ harnessId: "opencode", capabilities: {} }] }).harnesses[0]?.capabilities.renameSession).toBe(false);
    expect(wire.harnessList.parse({ harnesses: [{ harnessId: "tool", capabilities: { renameSession: true } }] }).harnesses[0]?.capabilities.renameSession).toBe(true);
  });
  it("retains the rename capability on harness status", async () => {
    const fake = fakeRh({
      "GET /api/capture/status": [{ id: "tool", name: "Tool", found: true, capture: { method: "hook", state: "receiving", detail: "" }, recall: { state: "connected", detail: "" }, canConnect: false }],
      "GET /api/harnesses": { harnesses: [{ harnessId: "tool", capabilities: { renameSession: true } }] },
    });
    expect((await createRhClient({ baseUrl: "http://rh", fetch: fake.fetch }).methods.harnesses!())[0]?.capabilities?.renameSession).toBe(true);
  });
});

it("reads a newly added tag from the hub on the next session load", async () => {
  let added = false;
  const id = "claude-code:s-1";
  const fake = fakeRh({
    "GET /api/sessions": catalogPageBody,
    "GET /api/sessions/Y2xhdWRlLWNvZGU6cy0x": catalogDetailBody,
    "GET /api/memory/tags": { tags: [] },
    "POST /api/memory/tags/add": () => { added = true; return { tag: { ...tag, state: "accepted" } }; },
    "POST /api/memory/tags/lookup": () => ({ sessions: { [id]: added ? [{ ...tag, state: "accepted" }] : [] } }),
  });
  const client = createClient({ baseUrl: "http://rh", fetch: fake.fetch });
  const sid = id as Parameters<typeof client.session>[0];
  expect((await client.session(sid)).tags).toEqual([]);
  await client.tag(sid, "project", "e2e", "add");
  expect((await client.session(sid)).tags).toEqual([{ key: "project", value: "e2e", state: "applied" }]);
});
