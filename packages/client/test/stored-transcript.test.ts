import { describe, expect, it } from "vitest";
import type { SessionId } from "@rivethub/contracts";
import { createRhClient } from "../src/rh/index.js";
import { displayTitle, sessionSegment } from "../src/rh/util.js";
import { fakeRh } from "./fake.js";

const BASE = "http://127.0.0.1:5174";
const SID = "claude-code:live-1" as SessionId;
const seg = sessionSegment(SID);

const stored = {
  messages: [
    { id: "a", role: "user", content: "Raise retention to two weeks.", createdAt: "2026-11-13T20:36:21.596Z", sessionId: SID },
    { id: "x", role: "user", content: "another session in the same minute", createdAt: "2026-11-13T20:36:21.700Z", sessionId: "claude-code:other" },
    { id: "b", role: "tool", toolName: "Bash", content: "zpool list\nNAME  SIZE", createdAt: "2026-11-13T20:36:22.000Z", sessionId: SID },
    { id: "c", role: "assistant", content: "14 days fits.", createdAt: "2026-11-13T20:36:23.000Z", sessionId: SID },
  ],
};

describe("a session's messages", () => {
  it("come from what the hub stored when the tool's own transcript is not on this machine", async () => {
    const rh = fakeRh({
      [`GET /api/harness-sessions/${seg}/transcript`]: { status: 400, body: { error: "invalid session id", code: "invalid_session_id" } },
      [`GET /api/sessions/${seg}`]: { id: SID, title: "t", startedAt: "2026-11-13T20:36:21.596Z" },
      "GET /api/memory/browse": stored,
    });
    const turns = await createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(SID);
    expect(turns.map((t) => [t.index, t.role, t.parts[0]])).toEqual([
      [1, "user", { kind: "text", text: "Raise retention to two weeks." }],
      [2, "assistant", { kind: "tool", name: "Bash", summary: "Bash: zpool list NAME SIZE" }],
      [3, "assistant", { kind: "text", text: "14 days fits." }],
    ]);
    const browse = new URL(BASE + rh.calls.find((c) => c.path.startsWith("/api/memory/browse"))!.path).searchParams;
    expect(browse.get("agent")).toBe("claude-code");
    expect(browse.get("since")).toBe("2026-11-13T20:36:20.596Z");
    expect(browse.get("before")).not.toBeNull();
  });

  it("come from what the hub stored when rh answers an empty transcript, as 0.8.3 does", async () => {
    const rh = fakeRh({
      [`GET /api/harness-sessions/${seg}/transcript`]: { sessionId: SID, turns: [] },
      [`GET /api/sessions/${seg}`]: { id: SID, title: "t", startedAt: "2026-11-13T20:36:21.596Z" },
      "GET /api/memory/browse": stored,
    });
    const turns = await createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(SID);
    expect(turns).toHaveLength(3);
  });

  it("is an empty list, not a failure, for a session with no messages anywhere", async () => {
    const rh = fakeRh({ [`GET /api/harness-sessions/${seg}/transcript`]: { sessionId: SID, turns: [] }, "GET /api/memory/browse": { messages: [] } });
    await expect(createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(SID)).resolves.toEqual([]);
  });

  it("keeps the original failure when memory has nothing for the session either", async () => {
    const rh = fakeRh({
      [`GET /api/harness-sessions/${seg}/transcript`]: { status: 400, body: { error: "invalid session id" } },
      "GET /api/memory/browse": { messages: [] },
    });
    await expect(createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(SID)).rejects.toThrow();
  });
});

describe("untitled sessions", () => {
  it("never show an id as a title", () => {
    expect(displayTitle("Session claude-code:live-1", SID)).toBe("Untitled session");
    expect(displayTitle("claude-code:live-1", SID)).toBe("Untitled session");
    expect(displayTitle("live-1", SID)).toBe("Untitled session");
    expect(displayTitle("  ", SID)).toBe("Untitled session");
    expect(displayTitle("Session notes for the release", SID)).toBe("Session notes for the release");
  });
});
