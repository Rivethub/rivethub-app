import { createMemoryHistory } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";
import { resetJourney } from "../lib/journey";

function renderAt(path: string, client: AppClient = createSampleClient()) {
  const user = userEvent.setup();
  const view = render(<App client={client} history={createMemoryHistory({ initialEntries: [path] })} />);
  return { client, user, ...view };
}

function transfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) => store.get(type) ?? "",
    clearData: () => store.clear(),
    setDragImage: () => {},
  } as DataTransfer;
}

function drag(el: Element, type: "dragStart" | "dragOver" | "drop" | "dragEnd", dt: DataTransfer) {
  fireEvent[type](el, { dataTransfer: dt });
}

/** Counts topic-tree fetches that have resolved, so a test can look after the refetch, not the optimistic frame. */
function watchRefetch(client: AppClient) {
  const original = client.topicTree.bind(client);
  let fetches = 0;
  client.topicTree = async () => {
    const result = await original();
    fetches += 1;
    return result;
  };
  return () => fetches;
}

async function afterRefetch(fetches: () => number, before: number) {
  await waitFor(() => expect(fetches()).toBeGreaterThan(before));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => resetJourney());

describe("dragging a topic", () => {
  it("nests a topic from the sidebar, marks the target, and drops it out of the top-level grid", async () => {
    const { client } = renderAt("/topics");
    const fetches = watchRefetch(client);
    const update = vi.spyOn(client, "updateTopic");
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    const main = screen.getByRole("main");
    const dt = transfer();
    const source = await within(nav).findByRole("treeitem", { name: /Omarchy setup/ });
    const target = within(nav).getByRole("treeitem", { name: /Home lab/ });
    const before = fetches();

    drag(source, "dragStart", dt);
    expect(source.className).toContain("opacity-50");
    drag(target, "dragOver", dt);
    expect(target).toHaveAttribute("data-drop", "valid");
    expect(within(target).getByText("Nest here")).toBeInTheDocument();
    drag(target, "drop", dt);
    drag(source, "dragEnd", dt);

    await afterRefetch(fetches, before);
    expect(update).toHaveBeenCalledWith("omarchy", { parentId: "home-lab" });
    expect(within(nav).getByRole("treeitem", { name: /Omarchy setup/ })).toHaveAttribute("aria-level", "2");
    expect(within(main).queryByRole("link", { name: /Omarchy setup/ })).not.toBeInTheDocument();
    expect(within(nav).getByRole("treeitem", { name: /Home lab/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("nests a topic dragged from the Topics page card", async () => {
    const { client } = renderAt("/topics");
    const fetches = watchRefetch(client);
    const update = vi.spyOn(client, "updateTopic");
    const main = await screen.findByRole("main");
    const nav = screen.getByRole("navigation", { name: "Sidebar" });
    const card = await within(main).findByRole("link", { name: /Side projects/ });
    const before = fetches();
    const dt = transfer();
    drag(card, "dragStart", dt);
    const target = within(nav).getByRole("treeitem", { name: /Home lab/ });
    drag(target, "dragOver", dt);
    expect(target).toHaveAttribute("data-drop", "valid");
    drag(target, "drop", dt);

    await afterRefetch(fetches, before);
    expect(update).toHaveBeenCalledWith("side-projects", { parentId: "home-lab" });
    expect(within(main).queryByRole("link", { name: /Side projects/ })).not.toBeInTheDocument();
  });

  it("shows an illegal target as not droppable and does not ask the hub", async () => {
    const { client } = renderAt("/topics");
    const update = vi.spyOn(client, "updateTopic");
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    const dt = transfer();
    const source = await within(nav).findByRole("treeitem", { name: /RivetHub/ });
    const target = within(nav).getByRole("treeitem", { name: /Home lab/ });
    drag(source, "dragStart", dt);
    expect(within(nav).getByText("Already at the top level")).toBeInTheDocument();
    drag(within(nav).getByLabelText("Top level"), "drop", dt);
    drag(target, "dragOver", dt);
    expect(target).toHaveAttribute("data-drop", "invalid");
    expect(within(target).getByText("Can't drop")).toBeInTheDocument();
    drag(target, "drop", dt);
    expect(update).not.toHaveBeenCalled();
    expect(source).toHaveAttribute("aria-level", "1");
  });

  it("puts the topic back and says so when the hub refuses", async () => {
    const { client } = renderAt("/topics");
    const fetches = watchRefetch(client);
    vi.spyOn(client, "updateTopic").mockRejectedValue(new Error("no"));
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    const source = await within(nav).findByRole("treeitem", { name: /Omarchy setup/ });
    const target = within(nav).getByRole("treeitem", { name: /Home lab/ });
    const before = fetches();
    const dt = transfer();
    drag(source, "dragStart", dt);
    drag(target, "drop", dt);
    expect(await screen.findByRole("status")).toHaveTextContent("Omarchy setup stayed where it was.");
    await afterRefetch(fetches, before);
    expect(within(nav).getByRole("treeitem", { name: /Omarchy setup/ })).toHaveAttribute("aria-level", "1");
  });

  it("moves from the keyboard", async () => {
    const { client, user } = renderAt("/topics");
    const fetches = watchRefetch(client);
    const update = vi.spyOn(client, "updateTopic");
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    const main = screen.getByRole("main");
    await user.click(await within(nav).findByRole("button", { name: "Expand Home lab" }));
    await user.click(within(nav).getByRole("button", { name: "Move Backups to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move Backups to…" });
    expect(within(dialog).queryByRole("button", { name: "Home lab" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Backups" })).not.toBeInTheDocument();
    const top = within(dialog).getByRole("button", { name: "Top level" });
    const before = fetches();
    top.focus();
    await user.keyboard("{Enter}");
    await afterRefetch(fetches, before);
    expect(update).toHaveBeenCalledWith("backups", { parentId: null });
    expect(within(nav).getByRole("treeitem", { name: /Backups/ })).toHaveAttribute("aria-level", "1");
    expect(within(main).getByRole("link", { name: /Backups/ })).toBeInTheDocument();
  });

  it("does not drag a topic that belongs to someone else", async () => {
    const base = createSampleClient();
    const topicTree = base.topicTree.bind(base);
    base.topicTree = async () => (await topicTree()).map((node) => (node.name === "Omarchy setup" ? { ...node, owner: "coco" } : node));
    renderAt("/topics", base);
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    const row = await within(nav).findByRole("treeitem", { name: /Omarchy setup/ });
    await waitFor(() => expect(row).toHaveAttribute("draggable", "false"));
    expect(within(row).queryByRole("button", { name: /Move Omarchy setup/ })).not.toBeInTheDocument();
  });
});

describe("Move to… on the topic page", () => {
  it("says when the open topic cannot move, and offers a parent when it can", async () => {
    const { user } = renderAt("/topics/rivethub");
    const main = await screen.findByRole("main");
    await user.click(await within(main).findByRole("button", { name: "Move RivetHub to…" }));
    expect(await screen.findByText("This topic can't move anywhere else.")).toBeInTheDocument();
  });
});
