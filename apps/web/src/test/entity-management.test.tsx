import { createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";
import { resetJourney } from "../lib/journey";

function renderAt(path: string, client: AppClient = createSampleClient()) {
  const user = userEvent.setup();
  const history = createMemoryHistory({ initialEntries: [path] });
  const view = render(<App client={client} history={history} />);
  return { user, history, ...view };
}

function startDrag(source: HTMLElement) {
  const data = new Map<string, string>();
  const dataTransfer = {
    dropEffect: "none",
    effectAllowed: "all",
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  };
  fireEvent.dragStart(source, { dataTransfer });
  return dataTransfer;
}

beforeEach(() => resetJourney());
afterEach(() => { (window as { __phone?: boolean }).__phone = false; });

describe("managing entities", () => {
  it("shows a new empty category in the index and sidebar immediately", async () => {
    const { user } = renderAt("/entities");
    await user.click(await screen.findByRole("button", { name: "New category" }));
    const form = within(screen.getByRole("dialog", { name: "New category" }));
    await user.type(form.getByRole("textbox", { name: "Category name" }), "Printers{Enter}");

    const category = await screen.findByRole("region", { name: "Printers" });
    expect(within(category).getByRole("heading")).toHaveTextContent("Printers 0");
    const sidebar = within(screen.getByRole("navigation", { name: "Sidebar" }));
    expect(sidebar.getByRole("link", { name: "Printers 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Printers 0" })).toBeInTheDocument();
  });

  it("creates an entity on phone with the open category preselected", async () => {
    (window as { __phone?: boolean }).__phone = true;
    const { history, user } = renderAt("/entities#machine");
    const create = await screen.findByRole("button", { name: "New entity" });
    expect(screen.getByRole("button", { name: "New category" })).toBeEnabled();
    await user.click(create);
    const form = within(screen.getByRole("dialog", { name: "New entity" }));
    expect(form.getByRole("combobox", { name: "Category" })).toHaveDisplayValue("Machine");
    await user.type(form.getByRole("textbox", { name: "Entity name" }), "Office printer");
    await user.click(form.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("heading", { name: "Office printer" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back" }));
    expect(history.location.hash).toBe("#machine");
    expect(within(await screen.findByRole("region", { name: "Machine" })).getByRole("link", { name: /Office printer/ })).toBeInTheDocument();
  });

  it("lights up sidebar and index destinations only while dragging and moves to an empty category", async () => {
    const client = createSampleClient();
    await client.createEntityCategory!("Archive");
    const move = vi.spyOn(client, "moveEntity");
    renderAt("/entities", client);

    const machines = within(await screen.findByRole("region", { name: "Machine" }));
    const source = machines.getByRole("link", { name: /^nas-01/ });
    const original = screen.getByRole("region", { name: "Machine" });
    const target = await screen.findByRole("region", { name: "Archive" });
    const sidebar = within(screen.getByRole("navigation", { name: "Sidebar" }));
    const sidebarTarget = sidebar.getByRole("link", { name: "Archive 0" });
    expect(target).not.toHaveAttribute("data-drop");
    expect(screen.queryByText("Drop here")).not.toBeInTheDocument();

    const dataTransfer = startDrag(source);
    expect(source).toHaveClass("outline-dashed");
    expect(original).toHaveAttribute("data-drop", "same");
    expect(machines.getByText("Already here")).toBeInTheDocument();
    fireEvent.dragOver(original, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe("none");
    fireEvent.drop(original, { dataTransfer });
    expect(move).not.toHaveBeenCalled();

    expect(target).toHaveAttribute("data-drop", "valid");
    expect(within(target).getByText("Drop here")).toBeInTheDocument();
    fireEvent.dragOver(sidebarTarget, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe("move");
    fireEvent.drop(sidebarTarget, { dataTransfer });

    const moved = await within(target).findByRole("link", { name: /^nas-01/ });
    await waitFor(() => expect(moved).toHaveAttribute("draggable", "true"));
    expect(machines.queryByRole("link", { name: /^nas-01/ })).not.toBeInTheDocument();
    expect(await sidebar.findByRole("link", { name: "Archive 1" })).toBeInTheDocument();
    expect(target).not.toHaveAttribute("data-drop");
  });

  it("moves from the entity page using the keyboard", async () => {
    const { user } = renderAt("/entities/nas-01");
    const state = within(await screen.findByRole("complementary", { name: "State" }));
    (await state.findByRole("button", { name: "Change category…" })).focus();
    await user.keyboard("{Enter}");
    const form = within(screen.getByRole("dialog", { name: "Change category" }));
    expect(form.queryByRole("option", { name: "Machine" })).not.toBeInTheDocument();
    const select = form.getByRole("combobox", { name: "Category" });
    expect(select).toHaveFocus();
    await user.selectOptions(select, form.getByRole("option", { name: "Service" }));
    form.getByRole("button", { name: "Move" }).focus();
    await user.keyboard("{Enter}");

    const sidebar = within(screen.getByRole("navigation", { name: "Sidebar" }));
    const category = await sidebar.findByRole("link", { name: "Service 2" });
    await user.click(category);
    expect(within(await screen.findByRole("region", { name: "Service" })).getByRole("link", { name: /^nas-01/ })).toBeInTheDocument();
  });

  it("updates immediately, then restores the lists and shows a notice if the move fails", async () => {
    const client = createSampleClient();
    let reject!: (reason: Error) => void;
    vi.spyOn(client, "moveEntity").mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    renderAt("/entities", client);
    const source = await within(await screen.findByRole("region", { name: "Machine" })).findByRole("link", { name: /^nas-01/ });
    const target = await screen.findByRole("region", { name: "Service" });
    await waitFor(() => expect(source).toHaveAttribute("draggable", "true"));
    const dataTransfer = startDrag(source);
    fireEvent.drop(target, { dataTransfer });

    expect(await within(target).findByRole("link", { name: /^nas-01/ })).toBeInTheDocument();
    reject(new Error("The hub refused the category change"));
    expect(await screen.findByRole("status")).toHaveTextContent("nas-01 stayed where it was.");
    expect(within(screen.getByRole("region", { name: "Machine" })).getByRole("link", { name: /^nas-01/ })).toBeInTheDocument();
    expect(within(target).queryByRole("link", { name: /^nas-01/ })).not.toBeInTheDocument();
  });

  it("keeps the read-only views usable when a client lacks management methods", async () => {
    const client = createSampleClient();
    delete client.entityTypes;
    delete client.createEntityCategory;
    delete client.createEntity;
    delete client.moveEntity;
    const { user } = renderAt("/entities", client);
    const source = await within(await screen.findByRole("region", { name: "Machine" })).findByRole("link", { name: /^nas-01/ });

    expect(screen.queryByRole("button", { name: "New category" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New entity" })).not.toBeInTheDocument();
    expect(source).toHaveAttribute("draggable", "false");
    startDrag(source);
    expect(screen.queryByText("Drop here")).not.toBeInTheDocument();
    await user.click(source);
    expect(await screen.findByRole("heading", { name: "nas-01" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change category…" })).not.toBeInTheDocument();
  });
});
