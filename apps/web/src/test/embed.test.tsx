import type { RivetHubDesktop } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../app";
import { createSampleClient } from "../dev/sample-client";
import { RETURN_TO_KEY } from "../lib/return-to";
import { sessionAuth } from "../client/auth";

function show(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App client={createSampleClient()} history={history} />);
  return history;
}

const host = { relogin: async () => null, host: { name: "T4" } } as RivetHubDesktop;

describe("embed mode", () => {
  it("keeps the app header and the inset window by default", async () => {
    show("/");
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    expect(within(nav).getByRole("img", { name: "RivetHub" })).toBeInTheDocument();
    expect(document.querySelector("[data-embedded='false']")).toBeTruthy();
    expect(document.querySelector("[data-embedded='true']")).toBeNull();
  });

  it("hides the app header and the inset window for ?embed=1, and keeps that query across navigation", async () => {
    const history = show("/?embed=1");
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    expect(within(nav).queryByRole("img", { name: "RivetHub" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Today" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(document.querySelector("[data-embedded='true']")).toBeTruthy();
    const frame = document.querySelector("[data-embedded='true'] > div");
    expect(frame?.className).not.toContain("rounded-");
    await userEvent.setup().click(within(nav).getByRole("link", { name: /^Topics/ }));
    expect(history.location.pathname).toBe("/topics");
    expect(history.location.search).toBe("?embed=1");
    expect(within(await screen.findByRole("navigation", { name: "Sidebar" })).queryByRole("img", { name: "RivetHub" })).not.toBeInTheDocument();
  });

  it("hides the same chrome when a host bridge is present and the URL does not ask", async () => {
    (window as { rivethub?: RivetHubDesktop }).rivethub = host;
    show("/");
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    expect(within(nav).queryByRole("img", { name: "RivetHub" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /^Review/ })).toBeInTheDocument();
    expect(document.querySelector("[data-embedded='true']")).toBeTruthy();
  });
});

describe("login return", () => {
  it("lands back on the memory item, with embed=1, after the login page replaces the document with /", async () => {
    sessionStorage.setItem(RETURN_TO_KEY, "/sessions/s-retention?embed=1");
    const history = show("/");
    expect(await screen.findByRole("heading", { level: 1, name: /Retention to 14 days/ })).toBeInTheDocument();
    expect(history.location.pathname).toBe("/sessions/s-retention");
    expect(history.location.search).toBe("?embed=1");
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
    expect(document.querySelector("[data-embedded='true']")).toBeTruthy();
  });

  it("remembers the open page when the hub answers that the visitor is signed out", () => {
    window.history.pushState({}, "", "/topics/rh-08?embed=1");
    sessionAuth.onUnauthorized?.();
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe("/topics/rh-08?embed=1");
    window.history.pushState({}, "", "/");
  });

  it("does not remember a page for a signed-in visitor who leaves the document", async () => {
    show("/topics/rh-08?embed=1");
    await screen.findByRole("navigation", { name: "Sidebar" });
    window.dispatchEvent(new Event("pagehide"));
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });
});
