import type { EntityId, IsoTime, ReviewItem, ReviewItemId, SessionDetail, SessionId, SessionSummaryRow } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../app";
import { clearDecisionError } from "../client/queries";
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

beforeEach(() => {
  resetJourney();
  clearDecisionError();
});

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

  it("takes a decision off the screen before the hub answers, and puts it back if that fails", async () => {
    let rejectDecision: (error: Error) => void = () => {};
    const gate = new Promise<void>((_resolve, reject) => {
      rejectDecision = reject;
    });
    const item: ReviewItem = {
      id: "f-1" as ReviewItemId,
      group: "fact",
      subject: { kind: "entity", id: "e-1" as EntityId, title: "nas-01" },
      text: "backup time",
      evidence: [],
      createdAt: now,
    };
    let todayCalls = 0;
    let releaseRefetch = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    const { user } = renderWith("/", (c) => ({
      reviewQueue: async () => [item],
      today: async (date) => {
        todayCalls += 1;
        if (todayCalls > 1) await refetchGate;
        return { ...(await c.today(date)), needsYou: [item], reviewCount: 1 };
      },
      decide: () => gate,
    }));
    const needs = await screen.findByRole("region", { name: /Needs you/ });
    await user.click(within(needs).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /Needs you/ })).not.toBeInTheDocument());
    expect(screen.queryByText("backup time")).not.toBeInTheDocument();
    expect(todayCalls).toBe(1);
    rejectDecision(new Error("refused"));
    expect(await screen.findByRole("alert")).toHaveTextContent("back for you to try again");
    const again = await screen.findByRole("region", { name: /Needs you/ });
    expect(within(again).getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(within(again).getByText("backup time")).toBeInTheDocument();
    expect(todayCalls).toBeGreaterThan(1);
    releaseRefetch();
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

describe("Today on a hub where a tool is set up and has sent nothing", () => {
  it("does not say the tool stopped", async () => {
    renderWith("/", (c) => ({
      harnesses: async () => (await c.harnesses()).map((h, i) => ({ ...h, capture: { method: h.capture.method, state: i === 0 ? "idle" as const : "not-connected" as const, detail: "nothing captured yet" } })),
      modelJobs: async () => [],
    }));
    expect(await screen.findByText(/No tool is sending sessions yet/)).toBeInTheDocument();
    expect(screen.queryByText(/stopped sending sessions/)).not.toBeInTheDocument();
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

  it("offers to open a session in its own tool and in the other tools that can recall it", async () => {
    const command = "claude --resume 76d71fb3-8325-48d6-a012-00d08a3b2fb1";
    const detail: SessionDetail = { ...row("s-resume", "A long day", 0), harness: "claude-code", cwd: "/home/phil/work/a-very-long-working-directory/another-long-path/component", resumeCommand: command, changed: [], entities: [], tags: [] };
    renderWith("/sessions/s-resume", (c) => ({
      session: async () => detail,
      harnesses: async () => {
        const base = (await c.harnesses())[0]!;
        const tool = (id: string, name: string, found: boolean, recall: string) => ({ ...base, id: id as typeof base.id, name, found, recall: { state: recall, detail: "" } });
        return [tool("claude-code", "Claude Code", true, "connected"), tool("codex", "Codex", true, "connected"), tool("kimi", "Kimi Code", true, "not-connected"), tool("cursor", "Cursor", false, "connected")];
      },
    }));
    const user = userEvent.setup();
    const menu = await screen.findByRole("menu", { name: "Open in" });
    await waitFor(() => expect(within(menu).getAllByRole("menuitem")).toHaveLength(2));
    const [own, other] = within(menu).getAllByRole("menuitem");
    expect(own).toHaveTextContent("Claude Code");
    expect(own).toHaveTextContent("Resume this session");
    expect(within(own!).getByText(command).tagName).toBe("CODE");
    expect(other).toHaveTextContent("Codex");
    expect(other).toHaveTextContent("Continue from memory");
    await user.click(own!);
    expect(await navigator.clipboard.readText()).toBe(command);
    expect(await screen.findByText("Copied for Claude Code. Paste it in a terminal.")).toBeInTheDocument();
    await user.click(other!);
    const prompt = await navigator.clipboard.readText();
    expect(prompt).toContain('"A long day" (session s-resume, Claude Code');
    expect(prompt).toContain("memory_search");
    expect(await screen.findByText("Copied for Codex. Paste it as your first message in Codex.")).toBeInTheDocument();
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

  it("offers older sessions when every session on the loaded page is hidden", async () => {
    const { user } = renderWith("/sessions", () => ({
      sessions: async (query) => (query.cursor ? { items: [rows[2]!] } : { items: [rows[0]!, rows[1]!], next: "2" }),
    }));
    expect(await screen.findByText(/2 sessions with no messages are hidden/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show older sessions" }));
    expect(await screen.findByRole("link", { name: /Review the entity worker/ })).toBeInTheDocument();
  });

  // An older hub lists sessions without counting their messages. Zero then means "not told", not "empty".
  const uncounted = row("s-old", "Move the backups", 0, { messageCountUnknown: true });

  it("lists a session whose message count the hub did not give", async () => {
    renderWith("/sessions", () => ({ sessions: async () => ({ items: [uncounted] }) }));
    const link = await screen.findByRole("link", { name: /Move the backups/ });
    expect(link).not.toHaveTextContent(/0 messages/);
    expect(screen.queryByText(/with no messages/)).not.toBeInTheDocument();
  });

  it("reads the transcript of a session whose message count the hub did not give", async () => {
    const detail: SessionDetail = { ...uncounted, changed: [], entities: [], tags: [] };
    renderWith("/sessions/s-old", () => ({
      session: async () => detail,
      transcript: async () => [{ index: 0, role: "user", at: now, parts: [{ kind: "text", text: "Where do the backups go now?" }] }],
    }));
    expect(await screen.findByText("Where do the backups go now?")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was said in this session/)).not.toBeInTheDocument();
  });

  it("says who a shared session came from, in the list and on its page", async () => {
    const shared = row("import:abc", "Move the backups", 3, { harness: "shared", origin: { author: "phil", verification: "unknown_key" } });
    renderWith("/sessions", () => ({ sessions: async () => ({ items: [shared] }) }));
    expect(await screen.findByRole("link", { name: /Move the backups/ })).toHaveTextContent("From phil");
  });

  it("says on a shared session's page that the sender is not confirmed", async () => {
    const detail: SessionDetail = { ...row("import:abc", "Move the backups", 3, { harness: "shared", origin: { author: "phil", verification: "unknown_key" } }), changed: [], entities: [], tags: [] };
    renderWith("/sessions/import:abc?tab=transcript", () => ({
      session: async () => detail,
      transcript: async () => [{ index: 1, role: "user", at: now, parts: [{ kind: "text", text: "Where do the backups go now?" }] }],
    }));
    expect(await screen.findByText(/phil shared this session with you.*not trusted yet/)).toBeInTheDocument();
    // The person who shared it wrote its prompts, not the person reading it.
    const prompt = (await screen.findByText("Where do the backups go now?")).closest("#m1")!;
    expect(within(prompt as HTMLElement).getByText("phil")).toBeInTheDocument();
  });

  it("offers no filing, sharing-with or renaming on a shared session, since the hub refuses them", async () => {
    const detail: SessionDetail = { ...row("import:abc", "Move the backups", 3, { harness: "shared", origin: { author: "phil", verification: "verified" } }), changed: [], entities: [], tags: [] };
    renderWith("/sessions/import:abc", () => ({ session: async () => detail }));
    expect(await screen.findByText(/cannot be filed under a topic yet/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be shared with a space yet/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filed under" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Shared with" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Session title/ })).not.toBeInTheDocument();
  });

  it("says so when a transcript read from memory stops short", async () => {
    const detail: SessionDetail = { ...row("s-long", "A long day", 900), changed: [], entities: [], tags: [] };
    renderWith("/sessions/s-long?tab=transcript", () => ({
      session: async () => detail,
      transcript: async () => [{ index: 1, role: "assistant", at: now, parts: [{ kind: "text", text: "Done." }], missing: "before" }],
    }));
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/Earlier messages are not shown/);
  });

  it("shows that a sharing change failed, and does not count it as done in the guide", async () => {
    const detail: SessionDetail = { ...row("s-vis", "Move the backups", 3), changed: [], entities: [], tags: [] };
    const { user } = renderWith("/sessions/s-vis", () => ({
      session: async () => detail,
      transcript: async () => [{ index: 1, role: "user", at: now, parts: [{ kind: "text", text: "Where do the backups go now?" }] }],
      setVisibility: async () => { throw new Error("the hub refused"); },
    }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Shared with" }), "space:household");
    expect(await screen.findByText(/was not changed: the hub refused/)).toHaveAttribute("role", "alert");
    expect(JSON.parse(localStorage.getItem("rivethub.journey") ?? "{}")).not.toMatchObject({ share: true });
  });
});

describe("Stats on a busy hub", () => {
  it("formats every job name by the same rule and admits when no cause was recorded", async () => {
    expect(jobName("compact-conversation")).toBe("Compact conversation");
    expect(jobName("some-new-job")).toBe("Some new job");
    renderWith("/stats", (c) => ({
      upkeep: { ...c.upkeep!, flagged: async () => [{ id: "1", task: "propose-tidy", cause: "", count: 1, lastFailedAt: now }, { id: "2", task: "compact-conversation", cause: "the model truncated the summary", count: 18, lastFailedAt: now }] },
    }));
    const failed = await screen.findByRole("region", { name: /Failed jobs/ });
    expect(within(failed).getByText("1 × Propose tidy")).toBeInTheDocument();
    expect(within(failed).getByText(/No cause was recorded/)).toBeInTheDocument();
    expect(within(failed).getByText("18 × Compact conversation")).toBeInTheDocument();
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

describe("Session controls match the hub", () => {
  const detail: SessionDetail = { ...row("s-controls", "Check controls", 3, { visibility: { kind: "space", space: "space-1" } }), changed: [], entities: [], tags: [] };
  const membership = { user: "phil", spaces: [{ id: "space-1", kind: "team", name: "Engineering" }, { id: "space-2", kind: "compartment", name: "Research" }], settings: { defaultVisibility: "private", chosen: true } };

  it("lists exactly membership spaces by name and marks the current space", async () => {
    renderWith("/sessions/s-controls", () => ({ session: async () => detail, me: async () => membership }));
    const picker = await screen.findByRole("combobox", { name: "Shared with" });
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual(["Private", "Engineering", "Research"]);
    expect(picker).toHaveValue("space:space-1");
    expect(within(picker).queryByText("household")).not.toBeInTheDocument();
  });

  it("offers household only if the hub returns it", async () => {
    renderWith("/sessions/s-controls", () => ({ session: async () => detail, me: async () => ({ ...membership, spaces: [{ id: "h", kind: "household", name: "household" }] }) }));
    expect(await screen.findByRole("option", { name: "household" })).toHaveValue("space:h");
  });

  it("explains private sessions without a dropdown when there are no spaces", async () => {
    renderWith("/sessions/s-controls", () => ({ session: async () => ({ ...detail, visibility: { kind: "private" } }), me: async () => ({ ...membership, spaces: [] }) }));
    expect(await screen.findByText("Private. Spaces are set up on the hub.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Shared with" })).not.toBeInTheDocument();
  });

  it("calls tag and displays the hub's failure", async () => {
    const calls: unknown[][] = [];
    const { user } = renderWith("/sessions/s-controls", () => ({
      session: async () => detail,
      tagOperations: async () => ["add"],
      tag: async (...args) => { calls.push(args); throw new Error("not your session"); },
    }));
    await user.click(await screen.findByRole("button", { name: "+ tag" }));
    await user.type(screen.getByRole("textbox", { name: "New tag, as key: value" }), "project:e2e{Enter}");
    expect(await screen.findByText("The tag was not changed: not your session.")).toHaveAttribute("role", "alert");
    expect(calls).toEqual([["s-controls", "project", "e2e", "add"]]);
  });

  it("offers no tag controls when the client has no supported operations", async () => {
    renderWith("/sessions/s-controls", () => ({ session: async () => ({ ...detail, tags: [{ key: "project", value: "e2e", state: "suggested" }] }), tagOperations: async () => [] }));
    await screen.findByRole("heading", { name: /Check controls/ });
    expect(screen.queryByRole("button", { name: "+ tag" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept.*e2e/ })).not.toBeInTheDocument();
  });

  it("renders a title as plain text for a tool without rename", async () => {
    renderWith("/sessions/s-controls", (c) => ({ session: async () => detail, harnesses: async () => (await c.harnesses()).map((h) => ({ ...h, capabilities: { renameSession: false } })) }));
    const title = await screen.findByRole("heading", { name: /Check controls/ });
    expect(within(title).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps branch and leaf paragraphs outside their metadata rows", async () => {
    const leaf = { level: "leaf" as const, text: "Full leaf paragraph", messageRange: [1, 3] as [number, number], children: [] };
    const { user } = renderWith("/sessions/s-controls?tab=summary", () => ({
      session: async () => ({ ...detail, memoryState: "summarized" }),
      summaryTree: async () => ({ level: "root", text: "Root", messageRange: [1, 3], children: [{ level: "branch", text: "Full branch paragraph", messageRange: [1, 3], children: [leaf] }] }),
    }));
    const paragraph = await screen.findByText("Full branch paragraph");
    const branch = screen.getByRole("button", { name: /Branch.*Full branch paragraph/ });
    const metadata = within(branch).getByText("Branch").parentElement!;
    expect(metadata).not.toContainElement(paragraph);
    expect(metadata).toHaveTextContent("msgs 1–3");
    expect(branch).toHaveAttribute("aria-expanded", "true");
    const leafParagraph = await screen.findByText("Full leaf paragraph");
    expect(leafParagraph.previousElementSibling).toHaveTextContent("Leaf · 1–3");
    expect(leafParagraph.parentElement).not.toHaveClass("md:grid");
  });
});

it("allows an explicitly supported rename and keeps the hub's refusal reason", async () => {
  const detail: SessionDetail = { ...row("s-rename", "Original title", 0), changed: [], entities: [], tags: [] };
  const { user } = renderWith("/sessions/s-rename", (c) => ({
    session: async () => detail,
    harnesses: async () => (await c.harnesses()).map((h) => ({ ...h, capabilities: { renameSession: true } })),
    renameSession: async () => { throw new Error("the session store is locked"); },
  }));
  await user.click(await screen.findByRole("button", { name: /Session title: Original title/ }));
  const input = screen.getByRole("textbox", { name: "Session title" });
  await user.clear(input);
  await user.type(input, "New title{Enter}");
  expect(await screen.findByText("The title was not changed: the session store is locked.")).toHaveAttribute("role", "alert");
});

it("uses hub membership names in Sharing settings", async () => {
  renderWith("/settings/sharing", () => ({ me: async () => ({ user: "phil", spaces: [{ id: "opaque-id", kind: "team", name: "Engineering" }], settings: { defaultVisibility: "private", chosen: true } }) }));
  expect(await screen.findByText("Engineering")).toBeInTheDocument();
  expect(screen.queryByText("household")).not.toBeInTheDocument();
});

it("groups Shared sessions under membership names, including spaces with no sessions", async () => {
  renderWith("/shared", () => ({
    me: async () => ({ user: "phil", spaces: [{ id: "opaque-id", kind: "team", name: "Engineering" }, { id: "empty", kind: "team", name: "Research" }], settings: { defaultVisibility: "private", chosen: true } }),
    sessions: async () => ({ items: [row("s-share", "Shared work", 3, { visibility: { kind: "space", space: "opaque-id" } })] }),
  }));
  expect(await screen.findByText("Engineering")).toBeInTheDocument();
  expect(screen.getByText("Research")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Shared work/ })).toBeInTheDocument();
  expect(screen.queryByText("household")).not.toBeInTheDocument();
  expect(screen.queryByText("opaque-id")).not.toBeInTheDocument();
});
