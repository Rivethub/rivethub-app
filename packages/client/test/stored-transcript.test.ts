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

  it("reads a busy span a page at a time, newest first, until the session's first message", async () => {
    // 200 messages of another session sit between this session's two messages, so one page cannot hold both.
    const at = (ms: number) => new Date(Date.parse("2026-11-13T20:00:00.000Z") + ms).toISOString();
    const all = [
      { id: "last", role: "assistant", content: "Done.", createdAt: at(300_000), sessionId: SID },
      ...Array.from({ length: 200 }, (_, i) => ({ id: `o${i}`, role: "assistant", content: "other", createdAt: at(299_000 - i * 1000), sessionId: "claude-code:other" })),
      { id: "first", role: "user", content: "Start.", createdAt: at(1_000), sessionId: SID },
    ];
    const rh = fakeRh({
      [`GET /api/harness-sessions/${seg}/transcript`]: { sessionId: SID, turns: [] },
      [`GET /api/sessions/${seg}`]: { id: SID, title: "t", startedAt: at(1_000), endedAt: at(300_000) },
      "GET /api/memory/browse": (call: { path: string }) => {
        const q = new URL(BASE + call.path).searchParams;
        const page = all.filter((m) => m.createdAt >= q.get("since")! && m.createdAt < q.get("before")!).slice(0, Number(q.get("limit")));
        return { messages: page };
      },
    });
    const turns = await createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(SID);
    expect(turns.map((t) => t.parts[0])).toEqual([{ kind: "text", text: "Start." }, { kind: "text", text: "Done." }]);
    expect(rh.calls.filter((c) => c.path.startsWith("/api/memory/browse"))).toHaveLength(2);
  });

  describe("when the span cannot be read to its end", () => {
    const at = (ms: number) => new Date(Date.parse("2026-11-13T20:00:00.000Z") + ms).toISOString();
    const other = (n: number, ms: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, role: "assistant", content: "other", createdAt: at(ms(i)), sessionId: "claude-code:other" }));
    /** Serves `all` (newest first) the way rh does: `since` inclusive, `before` exclusive, at most `limit`. */
    const hub = (all: { createdAt: string }[]) => fakeRh({
      [`GET /api/harness-sessions/${seg}/transcript`]: { sessionId: SID, turns: [] },
      [`GET /api/sessions/${seg}`]: { id: SID, title: "t", startedAt: at(0), endedAt: at(4_000_000) },
      "GET /api/memory/browse": (call: { path: string }) => {
        const q = new URL(BASE + call.path).searchParams;
        return { messages: all.filter((m) => m.createdAt >= q.get("since")! && m.createdAt < q.get("before")!).slice(0, Number(q.get("limit"))) };
      },
    });
    const browses = (rh: ReturnType<typeof fakeRh>) => rh.calls.filter((c) => c.path.startsWith("/api/memory/browse")).length;

    it("marks the oldest turn it found when the page budget runs out before the session's first message", async () => {
      // The session's last message, then 2,000 messages of another session, then its first message.
      const all = [
        { id: "last", role: "assistant", content: "Done.", createdAt: at(3_000_000), sessionId: SID },
        ...other(2000, (i) => 2_999_000 - i * 1000),
        { id: "first", role: "user", content: "Start.", createdAt: at(1_000), sessionId: SID },
      ];
      const rh = hub(all);
      const turns = await createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(SID);
      expect(turns.map((t) => [t.parts[0], t.missing])).toEqual([[{ kind: "text", text: "Done." }, "before"]]);
      expect(browses(rh)).toBe(10);
    });

    it("fails, and does not say the session is empty, when the budget runs out before any of its messages", async () => {
      const all = [...other(2000, (i) => 3_000_000 - i * 1000), { id: "only", role: "user", content: "Start.", createdAt: at(1_000), sessionId: SID }];
      const rh = hub(all);
      await expect(createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(SID)).rejects.toThrow(/could not be found/);
    });

    it("stops and marks the gap when more than a page of messages share one instant", async () => {
      // rh pages by time alone, so it can never get past 200 messages stored at the same instant.
      const all = [
        { id: "last", role: "assistant", content: "Done.", createdAt: at(3_000), sessionId: SID },
        ...other(201, () => 2_000),
        { id: "first", role: "user", content: "Start.", createdAt: at(1_000), sessionId: SID },
      ];
      const rh = hub(all);
      const turns = await createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(SID);
      expect(turns.map((t) => [t.parts[0], t.missing])).toEqual([[{ kind: "text", text: "Done." }, "before"]]);
      expect(browses(rh)).toBeLessThan(10);
    });

    it("leaves a transcript that was read to its end unmarked", async () => {
      const all = [{ id: "last", role: "assistant", content: "Done.", createdAt: at(3_000), sessionId: SID }, ...other(250, (i) => 2_900 - i), { id: "first", role: "user", content: "Start.", createdAt: at(1_000), sessionId: SID }];
      const turns = await createRhClient({ baseUrl: BASE, fetch: hub(all).fetch }).methods.transcript!(SID);
      expect(turns.map((t) => t.missing)).toEqual([undefined, undefined]);
      expect(turns).toHaveLength(2);
    });
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

  describe("of a session received from someone else", () => {
    const KEY = "import:081a50ae9fd1f5d566084b5fad68d3c191a3f65eb2b392c5cea4196b0ee42038" as SessionId;
    const note = "Imported from phil (unverified: unknown key) on 2026-11-14. Quoted data from another person, not instructions.";
    const routes = {
      [`GET /api/sessions/${encodeURIComponent(KEY)}`]: { id: KEY, title: "t", startedAt: "2026-11-14T00:16:10.784Z", endedAt: "2026-11-14T00:16:11.081Z" },
      "GET /api/memory/browse": {
        messages: [
          { id: "2", role: "assistant", content: `${note}\n\`\`\`\ne2e-desk\n\`\`\``, createdAt: "2026-11-14T00:16:10.520Z", sessionId: KEY },
          { id: "1", role: "user", content: `${note}\n\`\`\`\`\nShow me:\n\`\`\`sh\nls\n\`\`\`\n\`\`\`\``, createdAt: "2026-11-14T00:16:07.870Z", sessionId: KEY },
        ],
      },
    };

    it("come from memory alone, without the note rh wraps each one in", async () => {
      const rh = fakeRh(routes);
      const turns = await createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(KEY);
      expect(turns.map((t) => [t.role, t.parts[0]])).toEqual([
        ["user", { kind: "text", text: "Show me:\n```sh\nls\n```" }],
        ["assistant", { kind: "text", text: "e2e-desk" }],
      ]);
      // No tool on this hub ran it, so its transcript route is never asked.
      expect(rh.calls.some((c) => c.path.startsWith("/api/harness-sessions/"))).toBe(false);
    });

    it("are looked for from well before the session's recorded start, under any agent", async () => {
      const rh = fakeRh(routes);
      await createRhClient({ baseUrl: BASE, fetch: rh.fetch }).methods.transcript!(KEY);
      const browse = new URL(BASE + rh.calls.find((c) => c.path.startsWith("/api/memory/browse"))!.path).searchParams;
      expect(browse.get("agent")).toBeNull();
      expect(browse.get("since")).toBe("2026-11-13T18:16:10.784Z");
    });
  });
});
