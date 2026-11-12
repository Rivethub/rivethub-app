import type { InboundSession, ReceiveReport } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { canImport, decisionsFor, defaultChoices, importChoices, initialReceive, receiveReducer, undecided } from "./receiveModel";

const row = (n: number, patch: Partial<InboundSession> = {}): InboundSession => ({ n, title: `S${n}`, agent: "claude-code", messages: 3, findings: 0, rows: [], secret: false, allowed: ["import", "skip"], ...patch });
const held = row(2, { findings: 1, allowed: ["skip", "hold_spans"], secret: true });
const report = (sessions: InboundSession[], patch: Partial<ReceiveReport> = {}): ReceiveReport => ({
  bundle: "b",
  server: "http://127.0.0.1:1",
  downloaded: true,
  author: "alex",
  node: "n",
  verification: "verified",
  reason: "",
  sessions,
  authorFindings: 0,
  authorRows: [],
  summary: "",
  held: sessions.some((s) => s.findings > 0),
  ...patch,
});

describe("receive decisions", () => {
  it("needs a decision for every held row before it imports", () => {
    const r = report([row(1), held]);
    const choices = defaultChoices(r);
    expect(choices).toEqual({ 1: "import", 2: undefined });
    expect(undecided(r, choices).map((s) => s.n)).toEqual([2]);
    expect(canImport(r, choices)).toBe(false);
    expect(canImport(r, { ...choices, 2: "hold_spans" })).toBe(true);
  });

  it("offers no import on a row with a secret", () => {
    expect(decisionsFor(held)).toEqual(["skip", "hold_spans"]);
  });

  it("imports nothing when everything is skipped, and refuses a bundle whose author fields have a finding", () => {
    const r = report([row(1)]);
    expect(canImport(r, { 1: "skip" })).toBe(false);
    expect(canImport(report([row(1)], { authorFindings: 1 }), { 1: "import" })).toBe(false);
    expect(importChoices(r, { 1: "skip" })).toEqual([{ n: 1, decision: "skip" }]);
  });

  it("holds the code only until the import ends", () => {
    const typed = receiveReducer(initialReceive, { type: "code", code: "rivethub:abc#key" });
    const r = report([row(1)]);
    const reviewing = receiveReducer(typed, { type: "report", report: r });
    expect(reviewing.code).toBe("rivethub:abc#key");
    const done = receiveReducer(receiveReducer(reviewing, { type: "import" }), {
      type: "imported",
      result: { bundle: "b", receivedAt: "2026-11-12T00:00:00Z" as never, author: "alex", verification: "verified", imported: [], skipped: [] },
    });
    expect(done.code).toBe("");
  });
});
