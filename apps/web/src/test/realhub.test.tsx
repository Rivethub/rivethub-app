import type { IsoTime, ReviewItem, ReviewItemId, SessionDetail, SessionId, SessionSummaryRow } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";
import { resetJourney } from "../lib/journey";
import { jobName } from "../routes/stats";

/** What a real hub showed that the sample data did not: these states come from rh 0.8.3 on a busy Postgres hub. */
function renderWith(path: string, change: (client: AppClient) => Partial<AppClient>) {
  const base = createSampleClient();
  const client = { ...base, ...change(base) } as AppClient;
  const user = userEvent.setup();
  render(<App client={client} history={createMemoryHistory({ initialEntries: [path] })} />);
  return { user };
}

const now = new Date().toISOString() as IsoTime;
const row = (id: string, title: string, messageCount: number, extra: Partial<SessionSummaryRow> = {}): SessionSummaryRow => ({
  id: id as SessionId, title, harness: "grok-build", startedAt: now, messageCount, visibility: { kind: "private" }, kept: false, trashed: false, memoryState: "queued", ...extra,
});

beforeEach(() => resetJourney());

describe("Today on a busy hub", () => {
  it("shows one card for filing, however many filing proposals need you", async () => {
    const filing = (n: number): ReviewItem => ({ id: `f-${n}` as ReviewItemId, group: "filing", subject: { kind: "session", id: `s-${n}` as SessionId, title: `Session ${n}` }, text: "→ Home lab", evidence: [], createdAt: now });
    const items = [filing(1), filing(2), filing(3)];
    renderWith("/", (c) => ({
      reviewQueue: async () => items,
      today: async (date) => ({ ...(await c.today(date)), needsYou: items, reviewCount: 3 }),
    }));
    const needs = await screen.findByRole("region", { name: /Needs you/ });
    expect(within(needs).getAllByRole("button", { name: "File all" })).toHaveLength(1);
    expect(within(needs).getByText("3 sessions")).toBeInTheDocument();
  });

  it("leaves sessions that captured nothing and changed nothing out of What changed", async () => {
    renderWith("/", (c) => ({
      today: async (date) => {
        const digest = await c.today(date);
        return { ...digest, entries: [{ session: row("s-empty", "Untitled session", 0), changes: [] }, ...digest.entries] };
      },
    }));
    const changed = await screen.findByRole("region", { name: /What changed/ });
    expect(within(changed).queryByText("Untitled session")).not.toBeInTheDocument();
    expect(within(changed).getByText("Wire the memory change stream")).toBeInTheDocument();
  });
});

describe("Sessions on a busy hub", () => {
  const rows = [row("s-1", "Untitled session", 0), row("s-2", "Untitled session", 0), row("s-3", "Review the entity worker", 19, { gist: "Checked retries and merges." })];

  it("hides sessions with no messages until asked", async () => {
    const { user } = renderWith("/sessions", () => ({ sessions: async () => ({ items: rows }) }));
    expect(await screen.findByRole("link", { name: /Review the entity worker/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Untitled session/ })).not.toBeInTheDocument();
    expect(screen.getByText(/2 sessions with no messages are hidden/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show them" }));
    expect(await screen.findAllByRole("link", { name: /Untitled session/ })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Hide them" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: /Untitled session/ })).not.toBeInTheDocument());
  });

  it("says a session has no messages instead of failing to read them", async () => {
    const detail: SessionDetail = { ...row("s-1", "Untitled session", 0), changed: [], entities: [], tags: [] };
    renderWith("/sessions/s-1", () => ({
      session: async () => detail,
      transcript: async () => { throw new Error("should not be asked for"); },
    }));
    expect(await screen.findByText(/Nothing was said in this session/)).toBeInTheDocument();
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Summaries need a model/)).not.toBeInTheDocument();
  });
});

describe("Stats on a busy hub", () => {
  it("names jobs by what they do and admits when no cause was recorded", async () => {
    expect(jobName("compact-conversation")).toBe("Summarize a session");
    expect(jobName("some-new-job")).toBe("some-new-job");
    renderWith("/stats", (c) => ({
      upkeep: { ...c.upkeep!, flagged: async () => [{ id: "1", task: "propose-tidy", cause: "", count: 1, lastFailedAt: now }, { id: "2", task: "compact-conversation", cause: "the model truncated the summary", count: 18, lastFailedAt: now }] },
    }));
    const failed = await screen.findByRole("region", { name: /Failed jobs/ });
    expect(within(failed).getByText("1 × Suggest tidy-ups")).toBeInTheDocument();
    expect(within(failed).getByText(/No cause was recorded/)).toBeInTheDocument();
    expect(within(failed).getByText("18 × Summarize a session")).toBeInTheDocument();
  });
});

describe("Tags", () => {
  it("shows a plain tag as its value and a keyed tag as key and value", async () => {
    renderWith("/topics/rh-08", (c) => ({
      topic: async (id) => ({ ...(await c.topic(id)), tags: [{ key: "tag", value: "sqlite", state: "applied" }, { key: "project", value: "rivethub", state: "applied" }] }),
    }));
    expect(await screen.findByText("sqlite")).toBeInTheDocument();
    expect(screen.queryByText("tag: sqlite")).not.toBeInTheDocument();
    expect(screen.getByText("project: rivethub")).toBeInTheDocument();
  });
});
