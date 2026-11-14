import type { EntityId, IsoTime, ReviewItem, ReviewItemId, SessionId } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";

function show(path: string, change: (c: AppClient) => Partial<AppClient>) {
  const c = createSampleClient();
  render(<App client={{ ...c, ...change(c) } as AppClient} history={createMemoryHistory({ initialEntries: [path] })} />);
}
it("lists unfamiliar entity types under Other with the raw type", async () => {
  show("/entities", () => ({ entities: async () => [{ id: "future" as EntityId, title: "A constellation", type: "constellation", sessionCount: 1 }] }));
  const group = await screen.findByRole("region", { name: "Other" });
  expect(within(group).getByText("constellation")).toBeInTheDocument();
  expect(within(group).getByText("A constellation")).toBeInTheDocument();
});
it("interleaves history notes, unknown lines and fact changes newest first", async () => {
  show("/entities/nas-01?tab=history", (c) => ({
    entity: async (id) => ({ ...(await c.entity(id)), timeline: [
      { at: "2026-11-10T12:00:00Z" as IsoTime, text: "Older story", kind: "history", source: { id: "s-retention" as SessionId, title: "Source session" } },
      { at: "2026-11-12T12:00:00Z" as IsoTime, text: "Newer story", kind: "future" },
    ] }),
    changes: async () => [{ at: "2026-11-11T12:00:00Z" as IsoTime, text: "Middle fact", kind: "fact", subject: { kind: "entity", id: "nas-01" as EntityId, title: "nas-01" }, actor: { kind: "you" } }],
  }));
  await screen.findByText("Middle fact");
  const lines = screen.getAllByRole("listitem").filter((e) => /story|Middle fact/.test(e.textContent ?? ""));
  expect(lines.map((e) => e.textContent)).toEqual([expect.stringContaining("Newer story"), expect.stringContaining("Middle fact"), expect.stringContaining("Older story")]);
  expect(screen.getByRole("link", { name: "Source session" })).toHaveAttribute("href", "/sessions/s-retention");
});
it("pages 758 review items and labels fact keys without changing stored text", async () => {
  const user = userEvent.setup();
  const items: ReviewItem[] = Array.from({ length: 758 }, (_, i) => ({ id: `r${i}` as ReviewItemId, group: "fact", text: "other-install: Installed via raw SQL", subject: { kind: "entity", id: "nas-01" as EntityId, title: `Device ${i}` }, evidence: [], createdAt: "2026-11-12T12:00:00Z" as IsoTime }));
  show("/review", () => ({ reviewQueue: async () => items }));
  const list = await screen.findByRole("list", { name: "Proposed changes" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(50);
  expect(within(list).getAllByText("Install: Installed via raw SQL")).toHaveLength(50);
  expect(screen.getByText("New facts (758)")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(await within(list).findByRole("link", { name: "Device 50" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Device 0" })).not.toBeInTheDocument();
});
it("attributes teammate prompts and hides owner-only controls", async () => {
  show("/sessions/s-alex?tab=transcript", () => ({}));
  expect(await screen.findByText("Alex’s session")).toBeInTheDocument();
  expect(await screen.findByText(/#1 · Alex ·/)).toBeInTheDocument();
  for (const name of ["Keep", "Trash", "Restore", "Session title", "Filed under", "Shared with"]) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name })).not.toBeInTheDocument();
  }
});
