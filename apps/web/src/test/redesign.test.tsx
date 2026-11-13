import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import { createSampleClient } from "../dev/sample-client";
import { resetJourney } from "../lib/journey";

function renderAt(path: string) {
  const client = createSampleClient();
  const user = userEvent.setup();
  const view = render(<App client={client} history={createMemoryHistory({ initialEntries: [path] })} />);
  return { client, user, ...view };
}

beforeEach(() => resetJourney());

describe("Sidebar", () => {
  it("keeps the same navigation on every screen, with the open section's list nested under it", async () => {
    for (const path of ["/", "/sessions", "/sessions/s-retention", "/topics/rh-08", "/entities/nas-01", "/search", "/shared", "/stats", "/guide"]) {
      const { unmount } = renderAt(path);
      const nav = await screen.findByRole("navigation", { name: "Sidebar" });
      for (const name of ["Today", /^Review/, /^Sessions/, /^Topics/, /^Entities/, "Shared", /^Stats/]) {
        expect(await within(nav).findByRole("link", { name }), `${String(name)} on ${path}`).toBeInTheDocument();
      }
      unmount();
    }
    renderAt("/topics/rh-08");
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    expect(await within(nav).findByRole("tree", { name: "Topics" })).toBeInTheDocument();
  });
});

describe("Sessions", () => {
  it("lists sessions with their gist and opens one from the keyboard", async () => {
    const { user } = renderAt("/sessions");
    expect(await screen.findByRole("heading", { level: 1, name: /Sessions/ })).toBeInTheDocument();
    const first = await screen.findByRole("link", { name: /Wire the memory change stream/ });
    expect(first).toHaveTextContent("Topic and capture events replace the live feed.");
    await user.keyboard("j");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: /Wire the memory change stream/ })).toBeInTheDocument();
  });

  it("filters by view and by tool", async () => {
    const { user, client } = renderAt("/sessions");
    const sessions = vi.spyOn(client, "sessions");
    await screen.findByRole("link", { name: /Wire the memory change stream/ });
    await user.click(screen.getByRole("button", { name: /^Unfiled/ }));
    await waitFor(() => expect(screen.queryByRole("link", { name: /Wire the memory change stream/ })).not.toBeInTheDocument());
    expect(await screen.findByRole("link", { name: /Sketch Settings/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Tool" }), "codex");
    await waitFor(() => expect(sessions).toHaveBeenCalledWith(expect.objectContaining({ view: "unfiled", harness: "codex" })));
  });

  it("opens on the summary and steps to the next session", async () => {
    const { user } = renderAt("/sessions/s-retention");
    expect(await screen.findByRole("region", { name: "Session summary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
    await user.click(await screen.findByRole("link", { name: /Older/ }));
    await waitFor(() => expect(screen.queryByRole("heading", { level: 1, name: /Retention to 14 days/ })).not.toBeInTheDocument());
  });
});

describe("Search", () => {
  it("shows every match inside sessions and narrows with a time chip and a filter", async () => {
    const { user, client } = renderAt("/search?q=backup");
    const search = vi.spyOn(client, "search");
    const matches = await screen.findByRole("region", { name: /In sessions/ });
    expect((await within(matches).findAllByRole("link")).length).toBeGreaterThan(1);
    expect(within(matches).getAllByText("backup").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Last 7 days" }));
    await waitFor(() => expect(search).toHaveBeenCalledWith("backup", expect.objectContaining({ window: "last_7d" })));

    await user.click(screen.getByRole("button", { name: /More filters/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Look in" }), "summaries");
    await waitFor(() => expect(search).toHaveBeenCalledWith("backup", expect.objectContaining({ window: "last_7d", scope: "summaries" })));
    expect(screen.getByRole("button", { name: /More filters · 1/ })).toBeInTheDocument();
  });

  it("opens from anywhere with the slash key", async () => {
    const { user } = renderAt("/");
    await screen.findByRole("heading", { level: 1, name: /learned/ });
    await user.keyboard("/");
    expect(await screen.findByRole("combobox", { name: "Search memory" })).toBeInTheDocument();
  });
});

describe("Guide", () => {
  it("offers one next step on Today and ticks it off once done", async () => {
    const { user } = renderAt("/");
    const next = await screen.findByRole("region", { name: "Find something yourself" });
    await user.click(within(next).getByRole("link", { name: "Open Search" }));
    await user.type(await screen.findByRole("combobox", { name: "Search memory" }), "nas");
    await screen.findByRole("region", { name: /In sessions/ });

    await user.click(within(screen.getByRole("navigation", { name: "Sidebar" })).getByRole("link", { name: /^Guide/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Guide" })).toBeInTheDocument();
    const step = (await screen.findByText("Find something yourself")).closest("li")!;
    expect(step).toHaveTextContent(", done");
    expect(within(step).queryByRole("link")).not.toBeInTheDocument();
  });

  it("can be hidden on Today and brought back from the guide", async () => {
    const { user } = renderAt("/");
    await user.click(await screen.findByRole("button", { name: "Hide the guide on Today" }));
    expect(screen.queryByRole("region", { name: "Find something yourself" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("navigation", { name: "Sidebar" })).getByRole("link", { name: /^Guide/ }));
    await user.click(await screen.findByRole("button", { name: "Show it again" }));
    await user.click(within(screen.getByRole("navigation", { name: "Sidebar" })).getByRole("link", { name: "Today" }));
    expect(await screen.findByRole("region", { name: "Find something yourself" })).toBeInTheDocument();
  });
});

describe("Today", () => {
  it("says when a tool stopped sending sessions and links to the fix", async () => {
    renderAt("/");
    const status = await screen.findByText(/Codex stopped sending sessions/);
    expect(within(status.closest("p")!).getByRole("link", { name: "Fix" })).toHaveAttribute("href", "/settings/connections");
  });
});

describe("Shared", () => {
  it("lists what is shared with each space and explains sending to another hub", async () => {
    renderAt("/shared");
    expect(await screen.findByRole("heading", { level: 2, name: "With a space on this hub" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Retention to 14 days/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "With another RivetHub" })).toBeInTheDocument();
  });
});

describe("Stats", () => {
  it("shows the counts and retries a failed job", async () => {
    const { user } = renderAt("/stats");
    expect(await screen.findByText("48,210")).toBeInTheDocument();
    const failed = await screen.findByRole("region", { name: /Failed jobs/ });
    await user.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /Failed jobs/ })).not.toBeInTheDocument());
  });
});

describe("Topics by hand", () => {
  it("creates a topic from the Topics screen and opens it", async () => {
    const { user, client } = renderAt("/topics");
    const create = vi.spyOn(client, "createTopic");
    await user.click(await screen.findByRole("button", { name: "New topic" }));
    await user.type(screen.getByRole("textbox", { name: "New topic name" }), "Garden sensors{Enter}");
    expect(create).toHaveBeenCalledWith("Garden sensors", undefined);
    expect(await screen.findByRole("heading", { level: 1, name: /Garden sensors/ })).toBeInTheDocument();
  });

  it("files a session under a topic made on the spot", async () => {
    const { user, client } = renderAt("/sessions/s-retention");
    const place = vi.spyOn(client, "placeSession");
    await user.selectOptions(await screen.findByRole("combobox", { name: "Filed under" }), "New topic…");
    await user.type(screen.getByRole("textbox", { name: "New topic name" }), "Storage{Enter}");
    await waitFor(() => expect(place).toHaveBeenCalledWith("s-retention", expect.stringMatching(/^t-storage-/)));
  });
});
