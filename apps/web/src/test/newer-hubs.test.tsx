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
it("derives type chips, groups, counts and order from hub data", async () => {
  const user = userEvent.setup();
  show("/entities", () => ({ entities: async () => [
    { id: "s1" as EntityId, title: "Voyager", type: "spacecraft", sessionCount: 1 },
    { id: "s2" as EntityId, title: "Pioneer", type: "spacecraft", sessionCount: 1 },
    { id: "n1" as EntityId, title: "Notebook", type: "field-notes", sessionCount: 1 },
    { id: "t1" as EntityId, title: "Patch", type: "test_plot", typeName: "Research plots", sessionCount: 1 },
  ] }));
  const chips = await screen.findByRole("group", { name: "Type" });
  expect(within(chips).getAllByRole("button").map((e) => e.textContent)).toEqual(["All 4", "Spacecraft 2", "Field notes 1", "Research plots 1"]);
  const main = screen.getByRole("main");
  expect(within(main).getAllByRole("region").map((e) => e.getAttribute("aria-label"))).toEqual(["Spacecraft", "Field notes", "Research plots"]);
  const sidebar = screen.getByRole("navigation", { name: "Sidebar" });
  const types = within(sidebar).getAllByRole("link").filter((e) => e.getAttribute("href")?.startsWith("/entities#"));
  expect(types.map((e) => e.textContent)).toEqual(["Spacecraft2", "Field notes1", "Research plots1"]);
  expect(screen.queryByText("Other")).not.toBeInTheDocument();
  await user.click(within(chips).getByRole("button", { name: "Field notes 1" }));
  expect(screen.queryByRole("link", { name: /^Voyager/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Notebook/ })).toBeInTheDocument();
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
  expect(await within(await screen.findByRole("log", { name: "Transcript" })).findByText("Alex")).toBeInTheDocument();
  for (const name of ["Keep", "Trash", "Restore", "Session title", "Filed under", "Shared with"]) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name })).not.toBeInTheDocument();
  }
});

it("shows the hub type on an entity page without inventing singular or plural names", async () => {
  show("/entities/nas-01", (c) => ({ entity: async (id) => ({ ...(await c.entity(id)), type: "trial_plot", typeName: "Research plots" }) }));
  expect((await screen.findAllByText("Research plots", { exact: false })).length).toBeGreaterThan(0);
});

it("shows entity types in Search's palette results", async () => {
  show("/search?q=Voyager", () => ({
    entities: async () => [{ id: "voyager" as EntityId, title: "Voyager", type: "spacecraft", typeName: "Spacecraft fleet", sessionCount: 1 }],
    search: async () => ({ goTo: [{ subject: { kind: "entity", id: "voyager" as EntityId, title: "Voyager" }, snippet: "Beyond the planets", context: "Entity" }], actions: [] }),
  }));
  expect(await screen.findByText("Spacecraft fleet · Beyond the planets")).toBeInTheDocument();
});

it("shows the same data-derived type for Review subjects", async () => {
  show("/review", () => ({
    entities: async () => [{ id: "v" as EntityId, title: "Voyager", type: "spacecraft", typeName: "Spacecraft fleet", sessionCount: 1 }],
    reviewQueue: async () => [{ id: "r" as ReviewItemId, group: "fact", text: "other-orbit: Departed", subject: { kind: "entity", id: "v" as EntityId, title: "Voyager" }, evidence: [], createdAt: "2026-11-12T12:00:00Z" as IsoTime }],
  }));
  expect((await screen.findAllByText("Spacecraft fleet")).length).toBeGreaterThan(0);
});

it("shows the same data-derived type in Today's recently updated list", async () => {
  show("/", (c) => ({
    entities: async () => [{ id: "v" as EntityId, title: "Voyager", type: "spacecraft", typeName: "Spacecraft fleet", sessionCount: 1 }],
    today: async (date) => ({ ...(await c.today(date)), recentlyUpdated: [{ kind: "entity", id: "v" as EntityId, title: "Voyager" }] }),
  }));
  expect(await screen.findByText("Spacecraft fleet")).toBeInTheDocument();
});
