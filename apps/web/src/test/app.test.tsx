import { ReauthRequiredError } from "@rivethub/client";
import type { RivetHubDesktop } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("Connect", () => {
  it("shows the dry-run diff first and writes only when Connect is pressed", async () => {
    const { user, client } = renderAt("/settings/connections");
    const connect = vi.spyOn(client, "connectHarness");
    const connectButton = await screen.findByRole("button", { name: "Connect opencode" });
    await user.click(connectButton);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(connect.mock.calls[0]![2]).toEqual({ dryRun: true });
    expect(await within(dialog).findByText(/hooks/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Connect" }));
    await within(dialog).findByText(/Done\. rh changed this file/);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect.mock.calls[1]![2]).toBeUndefined();
  });
});

describe("Account", () => {
  it("signs out, signs in with device approval, and deletes after a confirm", async () => {
    const { user, client } = renderAt("/settings/account");
    const card = await screen.findByRole("region", { name: "Account" });
    expect(within(card).getByText("phil@example.com")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Sign out" }));
    await within(card).findByText("Not signed in");

    const signIn = vi.spyOn(client, "signIn");
    await user.click(within(card).getByRole("button", { name: "Sign in with your RivetHub account" }));
    await within(card).findByText("RVTB-HUBS");
    expect(within(card).getByRole("link", { name: "Open RivetHub sign-in" })).toHaveAttribute("target", "_blank");
    await within(card).findByText("you@example.com", {}, { timeout: 8000 });
    expect(signIn).toHaveBeenCalledWith();

    const del = vi.spyOn(client, "deleteAccount");
    await user.click(screen.getByRole("button", { name: "Delete account…" }));
    expect(del).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sign this node out" }));
    await screen.findByText("Not signed in");
    expect(del).toHaveBeenCalledOnce();
  }, 12000);

  afterEach(() => {
    delete (window as { rivethub?: RivetHubDesktop }).rivethub;
    vi.unstubAllGlobals();
  });

  it("refreshes a stale desktop sign-in and then shows the device code", async () => {
    const relogin = vi.fn(async () => "once");
    (window as { rivethub?: RivetHubDesktop }).rivethub = { relogin, updates: {} as NonNullable<RivetHubDesktop["updates"]> };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ csrf: "fresh" }), { status: 200 })));
    const { user, client } = renderAt("/settings/account");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByText("Not signed in");
    let calls = 0;
    vi.spyOn(client, "signIn").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new ReauthRequiredError("/api/account/signin");
      return { userCode: "RVTB-HUBS", verificationUri: "https://rivethub.cloud/device", expiresIn: 600, pollIntervalMs: 60_000 };
    });
    await user.click(screen.getByRole("button", { name: "Sign in with your RivetHub account" }));
    expect(await screen.findByText("RVTB-HUBS")).toBeInTheDocument();
    expect(screen.queryByText(/\/api\//)).not.toBeInTheDocument();
    expect(relogin).toHaveBeenCalledOnce();
    expect(calls).toBe(2);
  });

  it("says what to do when this page cannot refresh a stale sign-in", async () => {
    const { user, client } = renderAt("/settings/account");
    vi.spyOn(client, "signOut").mockRejectedValue(new ReauthRequiredError("/api/account/signout"));
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("more than five minutes old");
    expect(alert).toHaveTextContent("rh open");
    expect(alert.textContent).not.toMatch(/\/api\//);
  });

  it("keeps account deletion in a danger section below privacy, and hides it when signed out", async () => {
    const { user } = renderAt("/settings/account");
    const privacy = await screen.findByRole("heading", { name: "Privacy" });
    const danger = screen.getByRole("region", { name: "Danger" });
    expect(privacy.compareDocumentPosition(danger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(danger).getByText("Don't click here unless you really wanted to delete your account.")).toBeInTheDocument();
    expect(within(danger).getByRole("heading", { name: "Danger" })).toHaveClass("text-error");
    const link = within(danger).getByRole("link", { name: "Open cloud account settings to delete your account" });
    expect(link.getAttribute("style")).toContain("var(--error)");
    expect(within(screen.getByRole("region", { name: "Account" })).queryByRole("link", { name: /delete your account/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText("Not signed in");
    expect(screen.queryByRole("region", { name: "Danger" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /delete your account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete account…" })).not.toBeInTheDocument();
  });

  it("says what to do when deletion needs a fresh sign-in and this page cannot refresh it", async () => {
    const { user, client } = renderAt("/settings/account");
    const del = vi.spyOn(client, "deleteAccount").mockRejectedValue(new ReauthRequiredError("/api/account"));
    await user.click(await screen.findByRole("button", { name: "Delete account…" }));
    await user.click(screen.getByRole("button", { name: "Sign this node out" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("more than five minutes old");
    expect(alert.textContent).not.toMatch(/\/api\//);
    expect(del).toHaveBeenCalledOnce();
  });
});

describe("History", () => {
  it("lists a topic's changes from the client", async () => {
    renderAt("/topics/rh-08?tab=history");
    expect(await screen.findAllByText("Decision")).not.toHaveLength(0);
  });

  it("lists an entity's changes on its History tab", async () => {
    renderAt("/entities/nas-01?tab=history");
    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeInTheDocument();
  });
});
