import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../app";
import { createSampleClient } from "../dev/sample-client";
import { applyStoredTheme } from "../theme";

function renderAt(path: string) {
  const client = createSampleClient();
  const decide = vi.spyOn(client, "decide");
  const setFact = vi.spyOn(client, "setFact");
  const user = userEvent.setup();
  const view = render(<App client={client} history={createMemoryHistory({ initialEntries: [path] })} />);
  return { client, decide, setFact, user, ...view };
}

const current = () => screen.getByRole("listitem", { current: true });

describe("Review keyboard flow", () => {
  it("moves with J/K and decides with A, R, Shift+A and E", async () => {
    const { user, decide } = renderAt("/review");
    await waitFor(() => expect(current()).toHaveAccessibleName("nas-01: Backup time"));

    await user.keyboard("j");
    expect(current()).toHaveAccessibleName("Codex hook: Fails with 401 after the capture token rotates.");
    await user.keyboard("k");
    expect(current()).toHaveAccessibleName("nas-01: Backup time");
    await user.keyboard("j");

    await user.keyboard("a");
    await waitFor(() => expect(screen.queryByRole("listitem", { name: /^Codex hook/ })).not.toBeInTheDocument());
    expect(decide).toHaveBeenLastCalledWith("r-codex-401", { kind: "accept" });
    expect(current()).toHaveAccessibleName(/^memory-db/);

    await user.keyboard("r");
    await waitFor(() => expect(screen.queryByRole("listitem", { name: /^memory-db/ })).not.toBeInTheDocument());
    expect(decide).toHaveBeenLastCalledWith("r-hnsw", { kind: "reject" });
    expect(current()).toHaveAccessibleName(/^embed-server/);

    await user.keyboard("j");
    await user.keyboard("{Shift>}A{/Shift}");
    await waitFor(() => expect(screen.queryByRole("region", { name: "New things" })).not.toBeInTheDocument());
    expect(decide).toHaveBeenCalledWith("r-embed-host", { kind: "accept" });
    expect(decide).toHaveBeenCalledWith("r-qwen", { kind: "accept" });
    expect(screen.getByRole("listitem", { name: /^embed-server/ })).toBeInTheDocument();

    await user.keyboard("e");
    const input = await within(current()).findByRole("textbox", { name: "Your version" });
    await user.clear(input);
    await user.type(input, "Batch limit: 32{Enter}");
    await waitFor(() => expect(decide).toHaveBeenLastCalledWith(expect.any(String), { kind: "edit", value: "Batch limit: 32" }));
  });

  it("takes the newer value on a conflict with A", async () => {
    const { user, decide } = renderAt("/review");
    await waitFor(() => expect(current()).toHaveAccessibleName("nas-01: Backup time"));
    await user.keyboard("a");
    await waitFor(() => expect(decide).toHaveBeenCalledWith("r-backup-time", { kind: "choose", value: "03:00 nightly" }));
  });
});

describe("Theme", () => {
  it("switches from Settings and survives a reload", async () => {
    const first = renderAt("/settings/appearance");
    await first.user.click(await screen.findByRole("radio", { name: /T3 light/ }));
    expect(document.documentElement.dataset.theme).toBe("t3-light");
    expect(localStorage.getItem("rivethub.theme")).toBe("t3-light");
    first.unmount();

    document.documentElement.dataset.theme = "everforest";
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe("t3-light");
    renderAt("/settings/appearance");
    expect(await screen.findByRole("radio", { name: /T3 light/ })).toBeChecked();
  });
});

describe("Command palette", () => {
  it("opens with Ctrl+K and navigates to a result", async () => {
    const { user } = renderAt("/");
    await screen.findByRole("heading", { level: 1, name: /learned/ });
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    await user.type(within(dialog).getByRole("combobox"), "nas");
    await within(dialog).findByRole("option", { name: /^nas-01/ });
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "nas-01" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("opens with Cmd+K and closes with Escape", async () => {
    const { user } = renderAt("/");
    await screen.findByRole("heading", { level: 1, name: /learned/ });
    await user.keyboard("{Meta>}k{/Meta}");
    await screen.findByRole("dialog", { name: "Command palette" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument());
  });
});

describe("Entity facts", () => {
  it("edits a value in place and pins it", async () => {
    const { user, setFact } = renderAt("/entities/nas-01");
    const state = await screen.findByRole("complementary", { name: "State" });
    await user.click(within(state).getByRole("button", { name: "Edit Retention" }));

    const form = within(state).getByRole("form", { name: "Editing Retention" });
    const value = within(form).getByRole("textbox", { name: "Value" });
    expect(value).toHaveValue("14 days");
    await user.clear(value);
    await user.type(value, "21 days");
    await user.click(within(form).getByRole("checkbox", { name: "Pin" }));
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(setFact).toHaveBeenCalledWith("nas-01", { id: "f-retention", key: "Retention", value: "21 days", pinned: true });
    const edited = await within(state).findByRole("button", { name: "Edit Retention" });
    expect(edited).toHaveTextContent("21 days");
    const row = edited.closest("div.grid") as HTMLElement;
    expect(within(row).getByText("pinned by you")).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "Pinned" })).toBeInTheDocument();
  });
});
