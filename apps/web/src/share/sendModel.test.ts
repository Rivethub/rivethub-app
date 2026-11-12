import type { DraftReport, ShareableSession } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { canSanitize, chosenSessions, confirmCounts, initialSend, openFlags, pendingMarks, sendReducer, termProblem, type SendAction, type SendState } from "./sendModel";

const session = (id: string): ShareableSession => ({ id, title: `Session ${id}`, agent: "claude-code", first: "2026-11-01T10:00:00Z" as never, last: "2026-11-01T11:00:00Z" as never, messages: 4, excerpts: [] });
const report = (flags: DraftReport["flags"]): DraftReport => ({
  draft: "d-1",
  expiresAt: "2026-11-12T10:00:00Z" as never,
  totals: { secrets: 0, mapped: 0, redacted: 0, escaped: 0, rechecked: 0 },
  rules: [],
  sessions: [{ id: "a", agent: "claude-code", messages: 4 }],
  notScanned: "",
  bestEffort: "",
  flags,
});
const flag = (number: number, state: DraftReport["flags"][number]["state"]): DraftReport["flags"][number] => ({ number, score: 0.5, length: 3, text: "abc", state });

const run = (actions: SendAction[], from: SendState = initialSend) => actions.reduce(sendReducer, from);
const picked = (...ids: string[]) => run(ids.map((id): SendAction => ({ type: "toggle", session: session(id) })).concat({ type: "to-decide" }));

describe("deciding", () => {
  it("needs every row decided and at least one session that will be sent", () => {
    const state = picked("a", "b");
    expect(canSanitize(state.rows)).toBe(false);
    const half = run([{ type: "decide", id: "a", choice: { kind: "approve" } }], state);
    expect(canSanitize(half.rows)).toBe(false);
    expect(run([{ type: "sanitize" }], half).step).toBe("decide");
    const all = run([{ type: "decide", id: "b", choice: { kind: "deny" } }], half);
    expect(canSanitize(all.rows)).toBe(true);
    const onlyDenied = run([{ type: "decide", id: "a", choice: { kind: "deny" } }], all);
    expect(canSanitize(onlyDenied.rows)).toBe(false);
  });

  it("never puts a denied session in the request", () => {
    const state = run(
      [
        { type: "decide", id: "a", choice: { kind: "redact", terms: ["alex"], dropToolOutputs: true } },
        { type: "decide", id: "b", choice: { kind: "deny" } },
        { type: "decide", id: "c", choice: { kind: "approve" } },
      ],
      picked("a", "b", "c"),
    );
    expect(chosenSessions(state.rows)).toEqual([
      { id: "a", decision: { kind: "redact", terms: ["alex"], dropToolOutputs: true } },
      { id: "c", decision: { kind: "approve" } },
    ]);
  });

  it("refuses blank and repeated terms", () => {
    expect(termProblem([], "  ")).toMatch(/Type a term/);
    expect(termProblem(["alex"], "alex ")).toMatch(/already listed/);
    expect(termProblem(["alex"], "Alex")).toBeNull();
  });
});

describe("reviewing and sending", () => {
  it("leaves the review only when no flag is open, and echoes the counts rh checks", () => {
    const flagged = report([flag(1, { kind: "open" }), flag(2, { kind: "keep" }), flag(3, { kind: "keep" })]);
    const reviewing = run([{ type: "resumed", report: flagged }]);
    expect(openFlags(flagged)).toBe(1);
    expect(run([{ type: "to-destination" }], reviewing).step).toBe("review");

    const settled = report([flag(1, { kind: "redact" }), flag(2, { kind: "keep" }), flag(3, { kind: "keep" })]);
    const next = run([{ type: "report", report: settled }, { type: "to-destination" }], reviewing);
    expect(next.step).toBe("destination");
    expect(confirmCounts(settled)).toEqual({ sessions: 1, keptFlags: 2 });
  });

  it("marks only the flags the sender changed", () => {
    const flagged = report([flag(1, { kind: "open" }), flag(2, { kind: "keep" })]);
    expect(
      pendingMarks(flagged, {
        1: { choice: { kind: "map", term: "alex", placeholder: "PERSON_1" }, learn: true },
        2: { choice: { kind: "keep" } },
      }),
    ).toEqual([{ number: 1, choice: { kind: "map", term: "alex", placeholder: "PERSON_1" }, learn: true }]);
  });

  it("drops the share code when the flow resets, and a failed send returns to confirm", () => {
    const sharedState = run([{ type: "sent", sent: { code: "rivethub:x#key", expiresAt: "2026-11-19T00:00:00Z" as never, bytes: 10 } }]);
    expect(sharedState.sent?.code).toBe("rivethub:x#key");
    expect(run([{ type: "reset" }], sharedState)).toEqual(initialSend);

    const sending = { ...initialSend, step: "sending" as const };
    const failed = run([{ type: "fail", failure: { title: "No" } }], sending);
    expect(failed.step).toBe("confirm");
  });
});
