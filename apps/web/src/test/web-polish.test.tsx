import type { IsoTime, SessionId } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";
import { listSentence } from "../lib/format";

function renderWith(path: string, change: (c: AppClient) => Partial<AppClient>) {
  const base = createSampleClient();
  render(<App client={{ ...base, ...change(base) } as AppClient} history={createMemoryHistory({ initialEntries: [path] })} />);
}
const now = new Date().toISOString() as IsoTime;
const detail = `plug-in installed at /home/phil/${"very-long-directory/".repeat(30)}rivethub-capture.ts; last capture 2026-11-12T05:02:06Z`;
const title = "Implement this delegated task carefully. ".repeat(60).trim();
afterEach(() => { (window as { __phone?: boolean }).__phone = false; });

it.each([
  [["A"], "A"],
  [["A", "B"], "A and B"],
  [["A", "B", "C", "D"], "A, B, C and D"],
] as const)("joins %j as a normal list", (items, expected) => {
  expect(listSentence(items)).toBe(expected);
});

for (const phone of [false, true]) {
  describe(phone ? "phone" : "desktop", () => {
    it("keeps the long connection detail reachable alongside its action", async () => {
      (window as { __phone?: boolean }).__phone = phone;
      renderWith("/settings/connections", c => ({
        harnesses: async () => [{ ...(await c.harnesses())[0]!, name: "Test harness", found: true, canConnect: true,
          capture: { method: "hook", state: "not-connected", detail }, recall: { state: "not-connected", detail: "Not connected" } }],
        modelJobs: async () => [],
      }));
      const fullDetail = await screen.findByTitle(detail);
      expect(fullDetail).toHaveClass("truncate");
      const action = phone
        ? screen.getByRole("button", { name: /Test harness.*tap to connect/ })
        : within(screen.getByRole("table")).getByRole("button", { name: "Connect Test harness" });
      expect(action).toBeEnabled();
      if (!phone) expect(screen.getByRole("table")).toHaveClass("table-fixed");
      await userEvent.setup().click(action);
      expect(await screen.findByRole("heading", { name: "Capture for Test harness" })).toBeInTheDocument();
    });

    it("clamps Today titles and names the tool", async () => {
      (window as { __phone?: boolean }).__phone = phone;
      renderWith("/", c => ({ today: async date => {
        const digest = await c.today(date);
        return { ...digest, entries: [{ session: { ...digest.entries[0]!.session, title, harness: "claude-code" }, changes: [] }] };
      } }));
      expect(await screen.findByTitle(title)).toHaveClass("line-clamp-2");
      const changed = screen.getByRole("region", { name: /What changed/ });
      expect(within(changed).getByText("Claude Code")).toBeInTheDocument();
      expect(within(changed).queryByText("claude-code")).not.toBeInTheDocument();
    });

    it("separates user context, leaves assistant examples intact and retains hit anchors", async () => {
      (window as { __phone?: boolean }).__phone = phone;
      const example = "<custom-element>Example markup</custom-element>";
      renderWith("/sessions/test?tab=transcript&from=1&to=2", c => ({
        session: async () => ({ ...(await c.session("s-retention" as SessionId)), id: "test" as SessionId, messageCount: 3 }),
        transcript: async () => [
          { index: 1, role: "user", at: now, parts: [{ kind: "text", text: "<t3_code_instructions>\nHarness-only instructions.\n</t3_code_instructions>\nPlease fix the app." }] },
          { index: 2, role: "user", at: now, parts: [{ kind: "text", text: "<runtime_info>Only context.</runtime_info>" }] },
          { index: 3, role: "assistant", at: now, parts: [{ kind: "text", text: example }] },
        ],
      }));
      const said = await screen.findByText("Please fix the app.");
      expect(said.tagName).toBe("P");
      expect(said).not.toHaveTextContent("Harness-only instructions.");
      expect(said.closest("#m1")).toBeInTheDocument();
      const injected = screen.getByText("Harness-only instructions.").closest("details")!;
      expect(injected).not.toHaveAttribute("open");
      expect(within(injected).getByText("Context: t3 code instructions")).toBeInTheDocument();
      await userEvent.setup().click(within(injected).getByText("Context: t3 code instructions"));
      expect(injected).toHaveAttribute("open");
      expect(document.querySelector("#m2 p")).toBeNull();
      expect(screen.getByText(example).closest("details")).toBeNull();
    });

    it("lays a session out as a chat: prompt, folded steps, then the formatted reply", async () => {
      (window as { __phone?: boolean }).__phone = phone;
      const at = (seconds: number) => new Date(Date.UTC(2026, 10, 14, 12, 0, seconds)).toISOString() as IsoTime;
      renderWith("/sessions/test?tab=transcript", c => ({
        session: async () => ({ ...(await c.session("s-retention" as SessionId)), id: "test" as SessionId, messageCount: 4 }),
        transcript: async () => [
          { index: 0, role: "user", at: at(0), parts: [{ kind: "text", text: "Fix the build." }] },
          { index: 1, role: "assistant", at: at(2), parts: [
            { kind: "thought", text: "The user wants the build fixed.\n\nStart with the log." },
            { kind: "text", text: "I'll read the log first." },
            { kind: "tool", name: "Read", summary: "/tmp/build.log", input: { file_path: "/tmp/build.log" }, result: "error: missing semicolon" },
            { kind: "tool", name: "Bash", summary: "make", status: "error", input: { command: "make", description: "Build it" } },
            { kind: "tool", name: "Grep", summary: "TODO", id: "tool-9", input: { pattern: "TODO" } },
          ] },
          { index: 2, role: "assistant", at: at(72), model: "claude-opus-5-5", usage: { input: 24000, output: 1200, cached: 19200 }, parts: [{ kind: "text", text: "The build passes **now**.\n\n- one\n- two" }] },
        ],
        toolOutput: async (_session, tool) => ({ text: `three matches, read for ${tool}`, failed: false, truncated: false }),
      }));
      const user = userEvent.setup();
      const prompt = await screen.findByText("Fix the build.");
      expect(prompt.tagName).toBe("P");
      expect(prompt).toHaveClass("rounded-[20px]", "whitespace-pre-wrap");

      const steps = screen.getByText("Completed in 1m 12s · 3 tool calls").closest("details")!;
      expect(steps).not.toHaveAttribute("open");
      const think = within(steps).getByText("The user wants the build fixed.").closest("details")!;
      expect(within(think).getByText("Think")).toBeInTheDocument();
      expect(think).not.toHaveAttribute("open");
      expect(within(steps).getByText("I'll read the log first.")).toBeInTheDocument();
      const tools = within(steps).getByText("Read 1 file, ran 1 command and ran 1 search").closest("details")!;
      expect(within(tools).getByText("Build it")).toBeInTheDocument();
      expect(within(tools).getByText("failed")).toBeInTheDocument();
      await user.click(within(tools).getByText("/tmp/build.log"));
      expect(within(tools).getByText("error: missing semicolon").tagName).toBe("PRE");
      // An answer the transcript did not carry is read from the hub when the call is opened.
      expect(within(tools).queryByText(/three matches/)).not.toBeInTheDocument();
      await user.click(within(tools).getByText("Grep"));
      expect(await within(tools).findByText("three matches, read for tool-9")).toBeInTheDocument();

      const reply = screen.getByText("now");
      expect(reply.tagName).toBe("STRONG");
      expect(reply.closest("details")).toBeNull();
      expect(screen.getAllByRole("listitem").filter((item) => item.textContent === "one" || item.textContent === "two")).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Copy reply" })).toBeInTheDocument();
      expect(screen.getByText("claude-opus-5-5 · 1.2k out · 24k in · 80% cached")).toBeInTheDocument();
      expect(screen.queryByText(/\[thinking\]/)).not.toBeInTheDocument();
    });
  });
}

describe("the first-run screen on a live hub", () => {
  const live = (c: AppClient, state: "receiving" | "not-connected"): Partial<AppClient> => ({
    capabilities: async () => ({ ...(await c.capabilities()), account: "live" }),
    harnesses: async () => (await c.harnesses()).map((h) => ({ ...h, capture: { ...h.capture, state } })),
  });

  it("opens on a hub no tool has sent a session to", async () => {
    localStorage.removeItem("rivethub.welcomed");
    renderWith("/", c => live(c, "not-connected"));
    expect(await screen.findByRole("heading", { name: "Welcome to RivetHub" })).toBeInTheDocument();
  });

  it("does not open on a hub that is already capturing, even in a browser that has not seen it", async () => {
    localStorage.removeItem("rivethub.welcomed");
    renderWith("/", c => live(c, "receiving"));
    expect(await screen.findByRole("region", { name: /What changed/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome to RivetHub" })).not.toBeInTheDocument();
  });
});

describe("model jobs that are off or behind", () => {
  const job = (role: string, health: string, queued = 0) => ({ role, inheritsDefault: false, health, detail: health === "unconfigured" ? "no model is configured" : `${queued} queued`, queued });

  it("does not call a hub with no model broken", async () => {
    renderWith("/settings/connections", c => ({
      harnesses: async () => (await c.harnesses()).map((h) => ({ ...h, canConnect: false, capture: { ...h.capture, state: "receiving" as const }, recall: { state: "connected" as const, detail: "yes" } })),
      modelJobs: async () => ["default", "summarizer", "categorizer"].map((role) => job(role, "unconfigured")),
    }));
    expect(await screen.findByText("No model is set.")).toBeInTheDocument();
    expect(screen.queryByText(/things? to fix/)).not.toBeInTheDocument();
  });

  it("still lists a job that is slow or failing", async () => {
    renderWith("/settings/connections", c => ({
      harnesses: async () => (await c.harnesses()).map((h) => ({ ...h, canConnect: false, capture: { ...h.capture, state: "receiving" as const }, recall: { state: "connected" as const, detail: "yes" } })),
      modelJobs: async () => [job("summarizer", "unconfigured"), job("categorizer", "slow", 12)],
    }));
    expect((await screen.findByText(/1 thing to fix/)).parentElement).toHaveTextContent("The categorizer is slow.");
  });

  it("names on Today a job that is falling behind", async () => {
    renderWith("/", c => ({
      harnesses: async () => (await c.harnesses()).map((h) => ({ ...h, capture: { ...h.capture, state: "receiving" } })),
      modelJobs: async () => [job("summarizer", "healthy"), job("categorizer", "slow", 1519), job("embedder", "slow", 0)],
    }));
    expect(await screen.findByText("The categorizer is behind, with 1,519 waiting.")).toBeInTheDocument();
    expect(screen.queryByText(/embedder/)).not.toBeInTheDocument();
  });

  it("names a worker that is not running while jobs wait, and ignores one with no model", async () => {
    renderWith("/", c => ({
      harnesses: async () => (await c.harnesses()).map((h) => ({ ...h, capture: { ...h.capture, state: "receiving" } })),
      modelJobs: async () => [job("summarizer", "unconfigured", 40), job("categorizer", "not-running", 1628), job("wiki-writer", "not-running", 0)],
    }));
    const line = await screen.findByText("The categorizer is not running, with 1,628 waiting.");
    const status = line.closest("[role=status]")!;
    expect(status).not.toHaveTextContent(/summarizer/);
    expect(status).not.toHaveTextContent(/wiki/i);
  });
});
