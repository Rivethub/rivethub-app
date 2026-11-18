import type { DesktopUpdateState, RivetHubDesktop } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import { createSampleClient } from "../dev/sample-client";

function renderAccount() {
  render(<App client={createSampleClient()} history={createMemoryHistory({ initialEntries: ["/settings/account"] })} />);
}

describe("App updates", () => {
  afterEach(() => {
    delete (window as { rivethub?: RivetHubDesktop }).rivethub;
  });

  it("stays off the page when the host does not own updates", async () => {
    (window as { rivethub?: RivetHubDesktop }).rivethub = { relogin: async () => null, host: { name: "T3.1 Code" } };
    renderAccount();
    expect(await screen.findByRole("heading", { name: "Updates" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "App updates" })).not.toBeInTheDocument();
  });

  it("shows the desktop app's update state", async () => {
    const state: DesktopUpdateState = { state: "disabled", channel: "stable", reason: "Updates run only in the packaged app." };
    (window as { rivethub?: RivetHubDesktop }).rivethub = {
      relogin: async () => null,
      updates: { getState: async () => state, onState: () => () => {}, setChannel: async () => state, restartToUpdate: async () => {} },
    };
    renderAccount();
    expect(await screen.findByRole("heading", { name: "App updates" })).toBeInTheDocument();
    expect(await screen.findByText("Updates run only in the packaged app.")).toBeInTheDocument();
  });

  it("does not throw when reading the update state fails", async () => {
    (window as { rivethub?: unknown }).rivethub = {
      relogin: async () => null,
      updates: { getState: async () => { throw new Error("down"); }, onState: () => () => {}, setChannel: vi.fn(), restartToUpdate: vi.fn() },
    };
    renderAccount();
    expect(await screen.findByRole("heading", { name: "Updates" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "App updates" })).not.toBeInTheDocument();
  });
});