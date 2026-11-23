/** Synthetic bodies shaped like the rh gateway responses (crates/wire). */

const t = (iso: string) => Date.parse(iso);

export const topicsBody = {
  topics: [
    { id: "t-a", kind: "work", slug: "rivethub", name: "RivetHub", aliases: ["rivet"], createdAt: t("2026-10-01T00:00:00Z"), updatedAt: t("2026-11-06T10:00:00Z"), owner: "owner-1", visibility: "private", sessionCount: 3, lastActive: t("2026-11-06T10:00:00Z"), futureField: { ignored: true } },
    { id: "t-b", kind: "work", slug: "rh-runtime", name: "rh runtime", aliases: [], parent: "t-a", createdAt: t("2026-10-02T00:00:00Z"), updatedAt: t("2026-11-05T10:00:00Z"), owner: "owner-1", visibility: "private", sessionCount: 2, lastActive: t("2026-11-05T10:00:00Z") },
    { id: "t-c", kind: "work", slug: "capture-hooks", name: "Capture hooks", aliases: [], parent: "t-b", createdAt: t("2026-10-03T00:00:00Z"), updatedAt: t("2026-11-06T12:00:00Z"), closedAt: t("2026-11-06T12:00:00Z"), owner: "owner-1", visibility: "team-1", sessionCount: 1, lastActive: t("2026-11-06T12:00:00Z"), directory: { kind: "shared", path: "~/hooks" } },
    { id: "t-d", kind: "work", slug: "home-lab", name: "Home lab", aliases: ["homelab"], createdAt: t("2026-10-04T00:00:00Z"), updatedAt: t("2026-11-04T10:00:00Z"), owner: "owner-1", visibility: "private", sessionCount: 0 },
  ],
};

export const topicPageBody = {
  topic: topicsBody.topics[1],
  page: {
    slug: "rh-runtime",
    title: "rh runtime",
    aliases: [],
    tags: ["rust", "gateway"],
    entities: ["gateway"],
    currentState: "The gateway serves topics and memory.",
    article: "# rh runtime\n\nThe Rust gateway and its workers.\n\nMore detail follows.",
    history: [],
    citations: [],
    markdown: "# rh runtime",
    sources: [],
    updatedAt: "2026-11-05T10:00:00.000Z",
  },
  mentions: [{ topicId: "e-1", name: "gateway" }],
};

export const decisionsBody = {
  decisions: [
    { id: "d-1", topicId: "t-b", text: "Keep one gateway surface.", status: "active", by: "owner-1", sessionId: "claude-code:s-1", createdAt: t("2026-11-06T09:00:00Z"), updatedAt: t("2026-11-06T09:00:00Z") },
    { id: "d-2", topicId: "t-b", text: "Keep the plug-in host.", status: "superseded", supersededBy: "d-1", by: "owner-1", createdAt: t("2026-11-05T09:00:00Z"), updatedAt: t("2026-11-06T09:00:00Z") },
  ],
};

export const topicSessionsBody = {
  sessions: [
    { sessionId: "claude-code:s-1", topicId: "t-b", by: "categorizer", at: t("2026-11-06T09:30:00Z"), title: "Wire the stream", lastActive: t("2026-11-06T10:00:00Z"), node: "workstation", visibility: "private" },
  ],
  conversations: [],
};

export const filingBody = {
  sessions: [
    { sessionId: "claude-code:s-1", topicId: "t-b", by: "categorizer", at: t("2026-11-06T09:30:00Z"), title: "Wire the stream", lastActive: t("2026-11-06T10:00:00Z"), node: "workstation", visibility: "private" },
    { sessionId: "codex:s-2", topicId: "t-c", by: "you", at: t("2026-11-05T09:30:00Z"), title: "Hook 401", lastActive: t("2026-11-05T11:00:00Z"), node: "workstation", visibility: "private" },
  ],
  conversations: [],
  history: [],
};

export const harnessesBody = {
  harnesses: [
    { harnessId: "claude-code", chat: true, capabilities: { listSessions: true, drive: true, models: [] } },
    { harnessId: "hermes", chat: true, capabilities: { listSessions: false } },
  ],
};

export const claudeSessionsBody = {
  sessions: [
    { sessionId: "claude-code:s-1", harnessId: "claude-code", title: "Wire the stream", cwd: "~/rivethub-runtime", createdAt: "2026-11-06T09:00:00.000Z", updatedAt: "2026-11-06T10:00:00.000Z", status: "active", model: "opus" },
    { sessionId: "claude-code:s-3", harnessId: "claude-code", title: "Unfiled thing", cwd: "~/x", createdAt: "2026-11-04T09:00:00.000Z", updatedAt: "2026-11-04T10:00:00.000Z", status: "ended" },
  ],
};

export const sessionSummaryBody = {
  sessionId: "claude-code:s-1",
  harnessId: "claude-code",
  title: "Wire the stream",
  cwd: "~/rivethub-runtime",
  createdAt: "2026-11-06T09:00:00.000Z",
  updatedAt: "2026-11-06T10:00:00.000Z",
  status: "ended",
  model: "opus",
  switches: { model: true, effort: false },
};

export const transcriptBody = {
  sessionId: "claude-code:s-1",
  harnessId: "claude-code",
  turns: [
    { role: "user", text: "Wire the stream.", startedAtMs: t("2026-11-06T09:00:00Z"), endedAtMs: t("2026-11-06T09:00:05Z") },
    { role: "assistant", text: "", tools: [{ name: "Read", status: "done", id: "tool-1", input: { file_path: "/src/stream.rs" } }, { name: "Bash", status: "error", args: {} }], startedAtMs: t("2026-11-06T09:00:10Z") },
    { role: "assistant", text: "Done.", thinking: "hidden", startedAtMs: t("2026-11-06T09:01:00Z") },
  ],
  contextWindow: 1000000,
  compactAt: 965000,
  contextSource: "default",
  contextUsed: 1200,
};

export const summariesBody = {
  sessionId: "claude-code:s-1",
  summaries: [
    { id: "s-leaf-1", parentId: "s-branch-1", level: 0, kind: "leaf", content: "Read the stream code.", messageCount: 4, earliestAt: "2026-11-06T09:00:00Z", latestAt: "2026-11-06T09:10:00Z", createdAt: "2026-11-06T09:15:00Z", sourceMessageIds: [], vector: "embedded" },
    { id: "s-leaf-2", parentId: "s-branch-1", level: 0, kind: "leaf", content: "Wrote the event type.", messageCount: 6, earliestAt: "2026-11-06T09:10:00Z", latestAt: "2026-11-06T09:30:00Z", createdAt: "2026-11-06T09:35:00Z", sourceMessageIds: [], vector: "pending" },
    { id: "s-branch-1", parentId: "s-root", level: 1, kind: "branch", content: "Built the stream.", messageCount: 10, earliestAt: "2026-11-06T09:00:00Z", latestAt: "2026-11-06T09:30:00Z", createdAt: "2026-11-06T09:40:00Z", sourceMessageIds: [], vector: "embedded" },
    { id: "s-root", level: 2, kind: "root", content: "The change stream was wired end to end.", messageCount: 10, earliestAt: "2026-11-06T09:00:00Z", latestAt: "2026-11-06T09:30:00Z", createdAt: "2026-11-06T09:45:00Z", sourceMessageIds: [], vector: "embedded" },
  ],
  messages: { total: 10, user: 5, assistant: 5, system: 0, tool: 0, embedded: 8, pending: 2, failed: 0, skipped: 0 },
};

export const topicSearchBody = { topics: [topicsBody.topics[0]] };

export const memorySearchBody = {
  query: "stream",
  scope: "all",
  results: [
    { id: 36, source: "summary", content: "Wired the stream\nend to end.", createdAt: "2026-11-06T09:45:00.000000Z", score: 0.07, sessionId: "claude-code:s-1", title: "Wire the stream" },
    { id: "m-2", source: "message", content: "No session here.", createdAt: "2026-11-06T09:45:00Z", score: 0.01 },
  ],
  expanded: [],
};

export const trashBody = {
  candidates: [{ session: "claude-code:s-9", harness: "claude-code", title: "test", updatedAt: "2026-10-30T09:01:00.000Z", reason: "one-word-reply", userTurns: 1, reply: "ok" }],
};

/** crates/wire/src/gateway/session_catalog.rs: SessionSummaryPage. Optional fields are skipped, not null. */
export const catalogPageBody = {
  items: [
    { id: "claude-code:s-1", title: "Wire the stream", harness: "claude-code", startedAt: "2026-11-06T09:00:00Z", endedAt: "2026-11-06T10:30:00Z", messageCount: 42, topic: { id: "t-b", path: ["RivetHub", "rh runtime"] }, visibility: "private", kept: true, trashed: false, memoryState: "summarized", gist: "Wired the capture stream.", childCount: 2 },
    { id: "claude-code:agent-7", title: "Explore the store", harness: "claude-code", startedAt: "2026-11-06T09:10:00Z", messageCount: 5, visibility: "team-1", kept: false, trashed: false, memoryState: "capturing", parentId: "claude-code:s-1" },
  ],
  next: "1788685800000.claude-code:agent-7",
};

export const catalogDetailBody = {
  ...catalogPageBody.items[0],
  cwd: "/home/phil/rivethub",
  resumeCommand: "claude --resume s-1",
  changed: [],
  entities: [],
  tags: [],
};

/** crates/wire/src/gateway/entities.rs: EntitySummary[] and EntityArticle. */
export const entityListBody = [
  { id: "nas-01", title: "nas-01", type: "machine", sessionCount: 3 },
  { id: "rh", title: "rh", type: "software", sessionCount: 9 },
];

export const entityArticleBody = {
  id: "nas-01",
  title: "nas-01",
  type: "machine",
  sessionCount: 3,
  aliases: ["nas"],
  topic: { id: "t-d", path: ["Home lab"] },
  visibility: { kind: "space", space: "team-1" },
  lead: "The home NAS.",
  facts: [
    {
      id: "f-1", key: "backup window", value: "03:00", since: "2026-11-05T08:00:00Z", pinned: true,
      sources: [{ session: { id: "claude-code:s-1", title: "Wire the stream" }, at: "2026-11-05T08:00:00Z", value: "03:00" }],
      previous: { value: "02:30", until: "2026-11-05T08:00:00Z" },
    },
    {
      id: "f-2", key: "pool", value: "tank", since: "2026-11-04T08:00:00Z", pinned: false, sources: [],
      conflict: { candidates: [{ session: { id: "claude-code:s-1", title: "Wire the stream" }, at: "2026-11-04T08:00:00Z", value: "tank" }, { session: { id: "codex:c-1", title: "NAS check" }, at: "2026-11-04T09:00:00Z", value: "pool0" }] },
    },
  ],
  timeline: [
    { at: "2026-11-05T08:00:00Z", text: "Moved backup to 03:00", kind: "fact", source: { id: "claude-code:s-1", title: "Wire the stream" } },
    { at: "2026-11-01T08:00:00Z", text: "First seen", kind: "new" },
  ],
  connected: [{ id: "rh", title: "rh", sharedSessions: 2 }],
  sessions: [
    { id: "claude-code:s-1", title: "Wire the stream", harness: "claude-code", startedAt: "2026-11-06T09:00:00Z", endedAt: "2026-11-06T10:30:00Z", messageCount: 42, topic: { id: "t-b", path: ["RivetHub"] }, visibility: { kind: "private" }, kept: false, trashed: false, memoryState: "summarized", gist: "Wired it." },
  ],
  tags: [{ key: "area", value: "storage", state: "suggested" }],
  freshness: "live",
};

/** kernel harness_setup.rs: HarnessStatus[] (capture.method and states are kebab-case). */
export const captureStatusBody = [
  { id: "claude-code", name: "Claude Code", found: true, path: "/home/phil/.claude/settings.json", version: "2.1.0", capture: { method: "hook", state: "receiving", lastCaptureAt: "2026-11-06T10:30:00Z", detail: "hook installed; last capture 2026-11-06T10:30:00Z" }, recall: { state: "connected", detail: "MCP entry present" }, canConnect: false },
  { id: "codex", name: "Codex", found: true, capture: { method: "store-scan", state: "stale", detail: "hook missing; nothing captured yet" }, recall: { state: "not-connected", detail: "no MCP entry" }, canConnect: true },
];

export const connectOutcomeBody = { diff: "--- a/config.toml\n+++ b/config.toml\n@@\n+[hooks.rivethub]\n", backupPath: "" };

/** crates/wire/src/gateway/memory_models.rs: ModelJob[]. */
export const modelJobsBody = [
  { role: "default", provider: "big", model: "big-model", inheritsDefault: false, health: "healthy", detail: "inherited by categorizer, wiki-writer", queued: 0 },
  { role: "summarizer", inheritsDefault: false, health: "failing", detail: "2 queued", queued: 2, outage: "unreachable", reportedBy: "datahub" },
  { role: "wiki-writer", inheritsDefault: true, health: "slow", detail: "", queued: 0 },
];
