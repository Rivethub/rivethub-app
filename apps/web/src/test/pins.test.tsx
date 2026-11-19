import type { FetchLike } from "@rivethub/client";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import { createLiveClient } from "../client/live";
import { createSampleClient } from "../dev/sample-client";
import { reloadPins } from "../lib/pins";

const TOPIC = "/topics/t-rh-08";
const TOPIC_TITLE = "rh 0.8 memory cut";

/** The same assembly main.tsx uses for a real hub, with a stub in place of the network. */
function renderLive(path: string) {
  const fetch = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } }));
  const client = createLiveClient({ baseUrl: "https://hub.test", fetch });
  const user = userEvent.setup();
  const view = render(<App client={client} history={createMemoryHistory({ initialEntries: [path] })} />);
  return { fetch, user, ...view };
}

function pinnedTitles(): string[] {
  const sidebar = screen.getByRole("navigation", { name: "Sidebar" });
  const heading = within(sidebar).queryByText("Pinned");
  if (!heading) return [];
  const section = heading.parentElement?.parentElement;
  if (!section) return [];
  return within(section).getAllByRole("link").map((link) => link.textContent ?? "");
}

describe("Pins on a real hub", () => {
  afterEach(() => {
    (window as { __phone?: boolean }).__phone = false;
  });

  it("shows the pin button, keeps a pin in the sidebar across a reload, and drops it when unpinned", async () => {
    const first = renderLive(TOPIC);
    const pin = await screen.findByRole("button", { name: `Pin ${TOPIC_TITLE} to the sidebar` });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    expect(first.fetch).toHaveBeenCalled();
    expect(pinnedTitles()).toEqual([]);

    await first.user.click(pin);
    await waitFor(() => {
      expect(pinnedTitles()).toEqual([TOPIC_TITLE]);
      expect(screen.getByRole("button", { name: `Unpin ${TOPIC_TITLE}` })).toHaveAttribute("aria-pressed", "true");
    });
    expect(localStorage.getItem("rivethub.pins")).toContain(TOPIC_TITLE);

    await first.user.click(screen.getByRole("link", { name: /^Guide/ }));
    const step = (await screen.findByText("Pin what you come back to")).closest("li")!;
    expect(step).toHaveTextContent(", done");
    first.unmount();

    reloadPins();
    const second = renderLive(TOPIC);
    expect(await screen.findByRole("button", { name: `Unpin ${TOPIC_TITLE}` })).toHaveAttribute("aria-pressed", "true");
    expect(pinnedTitles()).toEqual([TOPIC_TITLE]);
    await second.user.click(screen.getByRole("button", { name: `Unpin ${TOPIC_TITLE}` }));
    await waitFor(() => expect(pinnedTitles()).toEqual([]));
    expect(localStorage.getItem("rivethub.pins")).toBe("[]");
  });

  it("pins an entity from its page", async () => {
    const { user } = renderLive("/entities/nas-01");
    await user.click(await screen.findByRole("button", { name: "Pin nas-01 to the sidebar" }));
    await waitFor(() => expect(pinnedTitles()).toEqual(["nas-01"]));
    expect(screen.getByRole("navigation", { name: "Sidebar" }).textContent).toContain("nas-01");
  });

  it("shows a renamed topic's current name on the pin", async () => {
    const { user } = renderLive(TOPIC);
    await user.click(await screen.findByRole("button", { name: `Pin ${TOPIC_TITLE} to the sidebar` }));
    await waitFor(() => expect(pinnedTitles()).toEqual([TOPIC_TITLE]));
    await user.click(screen.getByRole("button", { name: `Name: ${TOPIC_TITLE}. Click to edit` }));
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.clear(input);
    await user.type(input, "Memory cut{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Memory cut" })).toBeInTheDocument();
    await waitFor(() => expect(pinnedTitles()).toEqual(["Memory cut"]));
    expect(localStorage.getItem("rivethub.pins")).toContain("Memory cut");
    expect(localStorage.getItem("rivethub.pins")).not.toContain(TOPIC_TITLE);
  });

  it("replaces a stored title with the open page's title", async () => {
    localStorage.setItem("rivethub.pins", JSON.stringify([{ kind: "topic", id: "t-rh-08", title: "Yesterday's name" }]));
    renderLive(TOPIC);
    expect(await screen.findByRole("button", { name: `Unpin ${TOPIC_TITLE}` })).toBeInTheDocument();
    await waitFor(() => expect(pinnedTitles()).toEqual([TOPIC_TITLE]));
    expect(localStorage.getItem("rivethub.pins")).not.toContain("Yesterday's name");
  });

  it("shows a stored pin in the phone library", async () => {
    localStorage.setItem("rivethub.pins", JSON.stringify([{ kind: "topic", id: "t-rh-08", title: TOPIC_TITLE }]));
    (window as { __phone?: boolean }).__phone = true;
    renderLive("/topics");
    const label = await screen.findByText("PINNED");
    const row = label.nextElementSibling as HTMLElement;
    expect(within(row).getByRole("link", { name: TOPIC_TITLE })).toHaveAttribute("href", "/topics/t-rh-08");
  });

  it("drops a malformed pin list and still renders the page", async () => {
    localStorage.setItem("rivethub.pins", "{not json");
    const broken = renderLive(TOPIC);
    expect(await screen.findByRole("button", { name: `Pin ${TOPIC_TITLE} to the sidebar` })).toBeInTheDocument();
    expect(pinnedTitles()).toEqual([]);
    broken.unmount();

    reloadPins();
    localStorage.setItem("rivethub.pins", JSON.stringify({ pins: [] }));
    const object = renderLive(TOPIC);
    expect(await screen.findByRole("button", { name: `Pin ${TOPIC_TITLE} to the sidebar` })).toBeInTheDocument();
    expect(pinnedTitles()).toEqual([]);
    object.unmount();

    reloadPins();
    localStorage.setItem(
      "rivethub.pins",
      JSON.stringify([
        { kind: "topic", id: "t-rh-08", title: "Saved topic", extra: true },
        { kind: "nope", id: "x", title: "Junk" },
        { kind: "entity", id: "ghost", title: "Ghost", type: 3 },
        { kind: "topic", id: "", title: "blank" },
        null,
        "nope",
      ]),
    );
    renderLive(TOPIC);
    expect(await screen.findByRole("heading", { level: 1, name: TOPIC_TITLE })).toBeInTheDocument();
    await waitFor(() => expect(pinnedTitles()).toEqual([TOPIC_TITLE]));
    const sidebar = screen.getByRole("navigation", { name: "Sidebar" });
    expect(sidebar).not.toHaveTextContent("Junk");
    expect(sidebar).not.toHaveTextContent("Ghost");
    expect(sidebar).not.toHaveTextContent("blank");
  });

  it("renders and pins when localStorage cannot be used, and forgets the pin on reload", async () => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === "rivethub.pins") throw new Error("unavailable");
      return originalGet.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === "rivethub.pins") throw new Error("full");
      return originalSet.call(this, key, value);
    });
    try {
      const view = renderLive(TOPIC);
      await view.user.click(await screen.findByRole("button", { name: `Pin ${TOPIC_TITLE} to the sidebar` }));
      await waitFor(() => expect(pinnedTitles()).toEqual([TOPIC_TITLE]));
      view.unmount();
    } finally {
      vi.mocked(Storage.prototype.getItem).mockRestore();
      vi.mocked(Storage.prototype.setItem).mockRestore();
    }

    reloadPins();
    renderLive(TOPIC);
    expect(await screen.findByRole("button", { name: `Pin ${TOPIC_TITLE} to the sidebar` })).toBeInTheDocument();
    expect(pinnedTitles()).toEqual([]);
  });
});

describe("Sample pins", () => {
  it("keeps its own list and does not write browser storage", async () => {
    const user = userEvent.setup();
    render(<App client={createSampleClient()} history={createMemoryHistory({ initialEntries: ["/topics/rh-08"] })} />);
    expect(await screen.findByRole("button", { name: `Unpin ${TOPIC_TITLE}` })).toBeInTheDocument();
    expect(localStorage.getItem("rivethub.pins")).toBeNull();
    expect(pinnedTitles()).toContain(TOPIC_TITLE);

    await user.click(screen.getByRole("button", { name: `Unpin ${TOPIC_TITLE}` }));
    await waitFor(() => expect(pinnedTitles()).not.toContain(TOPIC_TITLE));
    await user.click(screen.getByRole("button", { name: `Pin ${TOPIC_TITLE} to the sidebar` }));
    await waitFor(() => expect(pinnedTitles()).toContain(TOPIC_TITLE));
    expect(localStorage.getItem("rivethub.pins")).toBeNull();
  });
});
