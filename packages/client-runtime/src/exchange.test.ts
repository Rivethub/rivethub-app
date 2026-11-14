import type { IsoTime, TranscriptPart, TranscriptTurn } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { elapsed, exchanges, groupSummary, replyMeta, thoughtSummary, tokens, toolCategory, toolLabel, verdict, type ToolPart } from "./exchange";

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 14, 12, 0, seconds)).toISOString() as IsoTime;
const turn = (index: number, role: "user" | "assistant", seconds: number, parts: TranscriptPart[], more: Partial<TranscriptTurn> = {}): TranscriptTurn => ({ index, role, at: at(seconds), parts, ...more });
const text = (value: string): TranscriptPart => ({ kind: "text", text: value });
const thought = (value: string): TranscriptPart => ({ kind: "thought", text: value });
const tool = (name: string, input: Record<string, unknown> = {}): ToolPart => ({ kind: "tool", name, summary: "", input });

describe("exchanges", () => {
  it("opens an exchange at each prompt and keeps only the last text as the reply", () => {
    const out = exchanges([
      turn(0, "user", 0, [text("Fix the build.")]),
      turn(1, "assistant", 2, [thought("The user wants the build fixed.\n\nStart with the log."), text("I'll read the log first."), tool("Read", { file_path: "/tmp/build.log" })]),
      turn(2, "assistant", 5, [tool("Bash", { command: "make" }), tool("Read", { file_path: "/tmp/build.log" })]),
      turn(3, "assistant", 72, [text("The build passes now.")], { model: "claude-opus-5-5", usage: { input: 24_000, output: 1_200, cached: 19_200 } }),
      turn(4, "user", 90, [text("Thanks.")]),
    ]);
    expect(out).toHaveLength(2);
    const [first, second] = out;
    expect(first!.prompt?.index).toBe(0);
    expect(first!.steps.map((step) => step.kind)).toEqual(["thought", "note", "tools"]);
    expect(first!.steps[2]).toMatchObject({ kind: "tools", tools: [{ name: "Read" }, { name: "Bash" }, { name: "Read" }] });
    expect(first!.answer).toBe("The build passes now.");
    expect(verdict(first!)).toBe("Completed in 1m 12s · 3 tool calls");
    expect(replyMeta(first!)).toBe("claude-opus-5-5 · 1.2k out · 24k in · 80% cached");
    expect(second!.answer).toBe("");
    expect(second!.steps).toEqual([]);
  });

  it("has no reply when the agent ended on a tool call, and takes a transcript that opens on the agent", () => {
    const out = exchanges([turn(0, "assistant", 0, [text("Looking."), tool("Grep", { pattern: "TODO" })])]);
    expect(out).toHaveLength(1);
    expect(out[0]!.prompt).toBeUndefined();
    expect(out[0]!.answer).toBe("");
    expect(out[0]!.steps.map((step) => step.kind)).toEqual(["note", "tools"]);
    expect(verdict(out[0]!)).toBe("Completed · 1 tool call");
  });

  it("marks an exchange the person interrupted and does not open a new one for the notice", () => {
    const out = exchanges([
      turn(0, "user", 0, [text("Run the migration.")]),
      turn(1, "assistant", 3, [tool("Bash", { command: "migrate" })]),
      turn(2, "user", 9, [text("[Request interrupted by user for tool use]")]),
    ]);
    expect(out).toHaveLength(1);
    expect(verdict(out[0]!)).toBe("Stopped after 3s · 1 tool call");
  });

  it("leaves the time out when the hub gave none", () => {
    const epoch = new Date(0).toISOString() as IsoTime;
    const out = exchanges([{ index: 0, role: "user", at: epoch, parts: [text("Hi")] }, { index: 1, role: "assistant", at: epoch, parts: [text("Hello.")] }]);
    expect(verdict(out[0]!)).toBe("Completed");
  });
});

describe("summaries", () => {
  it("names what a run of tool calls did, counting a file once", () => {
    expect(groupSummary([tool("Read", { file_path: "a" }), tool("Read", { file_path: "a" }), tool("Read", { file_path: "b" }), tool("Bash"), tool("Bash")])).toBe("Read 2 files and ran 2 commands");
    expect(groupSummary([tool("Grep"), tool("Edit", { file_path: "a" }), tool("WebFetch"), tool("Agent")])).toBe("Ran 1 search, edited 1 file and made 1 web request, etc.");
    expect(groupSummary([tool("memory_search")])).toBe("Used 1 tool");
    expect(groupSummary([])).toBe("");
  });

  it("sorts tools from several harnesses into the same kinds", () => {
    expect(["Bash", "shell", "exec_command"].map(toolCategory)).toEqual(["command", "command", "command"]);
    expect(["apply_patch", "Write", "read_file", "task", "mcp__x__y"].map(toolCategory)).toEqual(["edit", "edit", "read", "subagent", "tool"]);
  });

  it("labels a tool call by what it was asked to do", () => {
    expect(toolLabel(tool("Bash", { command: "cargo test\n  --all", description: "Run the tests" }))).toBe("Run the tests");
    expect(toolLabel(tool("Bash", { command: "cargo test\n  --all" }))).toBe("cargo test");
    expect(toolLabel(tool("Read", { file_path: "/home/p/a.rs" }))).toBe("/home/p/a.rs");
    expect(toolLabel({ kind: "tool", name: "memory_search", summary: "release codename" })).toBe("release codename");
    expect(toolLabel({ kind: "tool", name: "memory_stats", summary: "" })).toBe("memory_stats");
  });

  it("shows the first line of a thought, the elapsed time and token counts the way people read them", () => {
    expect(thoughtSummary("\n\n**Planning** the fix\nmore\n\nnext")).toBe("Planning the fix");
    expect([400, 59_400, 60_000, 3_725_000].map(elapsed)).toEqual(["1s", "59s", "1m 0s", "1h 2m"]);
    expect([812, 1_200, 24_000, 1_300_000].map(tokens)).toEqual(["812", "1.2k", "24k", "1.3M"]);
  });
});
