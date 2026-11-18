import type { HarnessStatus, HostOpenSessionRequest, HostOpenSessionResult, IsoTime, SessionDetail, SessionId } from "@rivethub/contracts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handoffPrompt, hostOpenRequest, OpenIn, openChoices } from "./open-in";

const detail: SessionDetail = {
  id: "s-resume" as SessionId,
  title: "A long day",
  harness: "claude-code",
  startedAt: "2026-11-04T21:12:00.000Z" as IsoTime,
  messageCount: 4,
  visibility: { kind: "private" },
  kept: false,
  trashed: false,
  memoryState: "summarized",
  changed: [],
  entities: [],
  tags: [],
  cwd: "/home/phil/work",
  resumeCommand: "claude --resume abc",
};

function harness(id: string, name: string, found: boolean, recall: string): HarnessStatus {
  return {
    id,
    name,
    found,
    canConnect: true,
    capture: { method: "hook", state: "receiving", detail: "" },
    recall: { state: recall, detail: "" },
  };
}

const harnesses = [
  harness("claude-code", "Claude Code", true, "connected"),
  harness("codex", "Codex", true, "connected"),
  harness("kimi", "Kimi Code", true, "not-connected"),
];

describe("openChoices", () => {
  it("puts the host first and leaves the clipboard choices under it", () => {
    const choices = openChoices(detail, harnesses, "T3.1 Code");
    expect(choices.map((choice) => choice.kind === "host" ? `Open in ${choice.name}` : choice.name)).toEqual(["Open in T3.1 Code", "Claude Code", "Codex"]);
    const request = hostOpenRequest(detail);
    expect(request).toEqual({
      sessionId: "s-resume",
      harness: "claude-code",
      title: "A long day",
      startedAt: detail.startedAt,
      cwd: "/home/phil/work",
      resumeCommand: "claude --resume abc",
      handoffPrompt: handoffPrompt(detail),
    });
    expect(request).not.toHaveProperty("nativeSessionId");
  });

  it("stays a clipboard menu when no host can open the session", () => {
    expect(openChoices(detail, harnesses).map((choice) => choice.name)).toEqual(["Claude Code", "Codex"]);
  });
});

describe("Open in host", () => {
  afterEach(() => {
    delete (window as { rivethub?: unknown }).rivethub;
  });

  async function open(result: HostOpenSessionResult | Error) {
    const openSession = vi.fn(async (_request: HostOpenSessionRequest) => {
      if (result instanceof Error) throw result;
      return result;
    });
    (window as { rivethub?: unknown }).rivethub = { relogin: async () => null, host: { name: "T3.1 Code", openSession } };
    const user = userEvent.setup();
    render(<OpenIn d={detail} harnesses={harnesses} />);
    const menu = screen.getByRole("menu", { name: "Open in" });
    const [first, own] = within(menu).getAllByRole("menuitem");
    expect(first).toHaveTextContent("Open in T3.1 Code");
    expect(own).toHaveTextContent("Claude Code");
    await user.click(first!);
    return openSession;
  }

  it("says the session was resumed", async () => {
    const openSession = await open({ opened: true, how: "resumed" });
    expect(await screen.findByRole("status")).toHaveTextContent("Resumed in T3.1 Code.");
    expect(openSession).toHaveBeenCalledOnce();
    expect(openSession.mock.calls[0]?.[0]).not.toHaveProperty("nativeSessionId");
  });

  it("says the session continued from memory", async () => {
    await open({ opened: true, how: "handoff" });
    expect(await screen.findByRole("status")).toHaveTextContent("Continued from memory in T3.1 Code.");
  });

  it("shows the host's reason when it could not open the session", async () => {
    await open({ opened: false, reason: "No thread for that working directory." });
    expect(await screen.findByRole("status")).toHaveTextContent("No thread for that working directory.");
  });
});
