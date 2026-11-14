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
      const action = screen.getByRole("button", { name: phone ? /Test harness.*tap to connect/ : "Connect Test harness" });
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
  });
}
