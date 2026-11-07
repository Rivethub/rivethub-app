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
    { sessionId: "claude-code:s-1", topicId: "t-b", by: "categorizer", at: t("2026-11-06T09:30:00Z"), title: "Wire the stream", lastActive: t("2026-11-06T10:00:00Z"), node: "phildesk", visibility: "private" },
  ],
  conversations: [],
};

export const filingBody = {
  sessions: [
    { sessionId: "claude-code:s-1", topicId: "t-b", by: "categorizer", at: t("2026-11-06T09:30:00Z"), title: "Wire the stream", lastActive: t("2026-11-06T10:00:00Z"), node: "phildesk", visibility: "private" },
    { sessionId: "codex:s-2", topicId: "t-c", by: "you", at: t("2026-11-05T09:30:00Z"), title: "Hook 401", lastActive: t("2026-11-05T11:00:00Z"), node: "phildesk", visibility: "private" },
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
