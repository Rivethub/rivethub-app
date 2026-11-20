import type {
  Account,
  Change,
  EntityArticle,
  EntityId,
  FactId,
  HarnessStatus,
  Hub,
  HubId,
  IsoTime,
  ModelJob,
  ReviewItem,
  ReviewItemId,
  SessionDetail,
  SessionId,
  SubjectRef,
  LegacySummaryNode,
  TagAssignment,
  TopicId,
  TopicNode,
  TranscriptTurn,
} from "@rivethub/contracts";

const DAY = 86_400_000;
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);

/** A local time `daysAgo` days before today, as an ISO string. */
export function at(daysAgo: number, hhmm: string): IsoTime {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(midnight.getTime() - daysAgo * DAY + ((h ?? 0) * 60 + (m ?? 0)) * 60_000).toISOString() as IsoTime;
}

export const todayDate = (daysAgo = 0) => {
  const d = new Date(midnight.getTime() - daysAgo * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const tid = (s: string) => s as TopicId;
const eid = (s: string) => s as EntityId;
const sid = (s: string) => s as SessionId;

// Topics

interface TopicSeed {
  id: string;
  name: string;
  n: number;
  status?: "open" | "closed";
  days?: number;
  children?: TopicSeed[];
}

const topicSeeds: TopicSeed[] = [
  {
    id: "rivethub", name: "RivetHub", n: 41, days: 0, children: [
      {
        id: "rh-runtime", name: "rh runtime", n: 19, days: 0, children: [
          {
            id: "rh-08", name: "rh 0.8 memory cut", n: 12, days: 0, children: [
              { id: "change-stream", name: "Memory change stream", n: 3, status: "closed", days: 0 },
              { id: "model-roles", name: "Model roles", n: 2, days: 1 },
            ],
          },
          { id: "capture-hooks", name: "Capture hooks", n: 9, days: 0 },
        ],
      },
      { id: "desktop-app", name: "Desktop app", n: 14, days: 3, children: [{ id: "desktop-settings", name: "Settings", n: 5, days: 1 }] },
      { id: "plug-ins", name: "Plug-ins", n: 8, days: 4 },
    ],
  },
  {
    id: "home-lab", name: "Home lab", n: 23, days: 2, children: [
      { id: "backups", name: "Backups", n: 6, days: 2 },
      { id: "postgres", name: "Postgres", n: 7, days: 0 },
    ],
  },
  { id: "omarchy", name: "Omarchy setup", n: 18, days: 6 },
  { id: "side-projects", name: "Side projects", n: 12, days: 12 },
];

function toNode(seed: TopicSeed, parentId?: TopicId): TopicNode {
  const node: TopicNode = {
    id: tid(seed.id),
    name: seed.name,
    sessionCount: seed.n,
    status: seed.status ?? "open",
    children: [],
  };
  if (parentId) node.parentId = parentId;
  if (seed.days !== undefined) node.lastActivity = at(seed.days, "14:02");
  node.children = (seed.children ?? []).map((c) => toNode(c, node.id));
  return node;
}

export const topicTree = (): TopicNode[] => topicSeeds.map((s) => toNode(s));

export interface TopicExtra {
  lead: string;
  article?: string;
  current?: string;
  aliases: string[];
  folder?: string;
  decisions: { text: string; days: number; superseded?: boolean; source?: string }[];
  states: Record<string, string>;
  entities: string[];
  tags: TagAssignment[];
}

export const topicExtras: Record<string, TopicExtra> = {
  "rh-08": {
    lead:
      "The release that turns the RivetHub runtime into a memory product: capture from every harness, manage what was captured, and serve it back as recall. Live sessions, chat, terminal and delegation moved to T3.",
    current: "Currently, the memory change stream is in and session visibility is moving off the live registry.",
    article: [
      "The release that turns the RivetHub runtime into a memory product: capture from every harness, manage what was captured, and serve it back as recall. Live sessions, chat, terminal and delegation moved to T3.",
      "",
      "### What stays",
      "- Capture from every harness, through each tool's own hooks.",
      "- Sessions, summaries, topics, entities and the wiki.",
      "- Recall over MCP: `memory_search`, `memory_browse`, `wiki_read`.",
      "",
      "### What moved out",
      "Chat, terminals, harness launch and delegation. A config that still names them loads with **one warning each**.",
      "",
      "### Still open",
      "Session visibility is moving off the live registry and onto tenancy.",
    ].join("\n"),
    aliases: ["memory cut", "rh 0.8"],
    folder: "~/rivethub-runtime",
    decisions: [
      { text: "The memory profile is the only gateway surface.", days: 0, source: "s-change-stream" },
      { text: "Each worker role names its own model under memory.models.", days: 0, source: "s-model-roles" },
      { text: "Connect adds hook and MCP entries only when missing, with a diff and a backup.", days: 0, source: "s-visibility" },
      { text: "Keep the plug-in host for 0.8.", days: 1, superseded: true, source: "s-plugin-host" },
    ],
    states: { "change-stream": "Done · 3 sessions", "model-roles": "In progress · 2 sessions" },
    entities: ["workstation", "memory-db", "rivethub-runtime"],
    tags: [
      { key: "project", value: "rivethub", state: "applied" },
      { key: "kind", value: "release", state: "applied" },
    ],
  },
  backups: {
    lead: "How the memory store and wiki get backed up to nas-01 every night, and how long the copies are kept.",
    current: "Retention is 14 days. The nightly run time is disputed between 02:30 and 03:00.",
    aliases: ["nightly backup"],
    folder: "~/homelab",
    decisions: [
      { text: "Keep nightly backups for 14 days.", days: 2, source: "s-retention" },
      { text: "Snapshots are read-only to the backup user.", days: 5, source: "s-snapshots" },
      { text: "Back up with pg_dump plus a copy of the wiki pages.", days: 7, source: "s-nightly" },
    ],
    states: {},
    entities: ["nas-01", "memory-db"],
    tags: [{ key: "area", value: "storage", state: "applied" }],
  },
  "capture-hooks": {
    lead: "The hooks and plug-ins each harness uses to send sessions to rh, and what breaks them.",
    current: "Codex has not posted for three days because its hook token rotated.",
    aliases: ["hooks"],
    decisions: [{ text: "Hooks read the capture token from the rh config, not their own copy.", days: 0, source: "s-codex-hook" }],
    states: {},
    entities: ["codex-hook", "workstation"],
    tags: [{ key: "area", value: "capture", state: "applied" }],
  },
};

// Entities

interface EntitySeed {
  id: string;
  title: string;
  type: EntityArticle["type"];
  typeName?: string;
  n: number;
}

export const entitySeeds: EntitySeed[] = [
  { id: "rivet-org", title: "Rivet", type: "organization", typeName: "Organization", n: 2 },
  { id: "entity-worker", title: "Entity worker", type: "project", n: 1 },
  { id: "home-office", title: "Home office", type: "place", n: 1 },
  { id: "nas-01", title: "nas-01", type: "machine", n: 9 },
  { id: "workstation", title: "workstation", type: "machine", n: 41 },
  { id: "lab-server", title: "lab-server", type: "machine", n: 6 },
  { id: "memory-db", title: "memory-db", type: "database", n: 18 },
  { id: "embed-server", title: "embed-server", type: "service", n: 5 },
  { id: "codex-hook", title: "Codex hook", type: "software", n: 4 },
  { id: "phil", title: "Phil", type: "person", n: 120 },
  { id: "rivethub-runtime", title: "rivethub-runtime", type: "repository", n: 64 },
  { id: "nomic-embed", title: "nomic-embed", type: "model", n: 7 },
  { id: "qwen-27b", title: "qwen-27b", type: "model", n: 3 },
];

export function nas01(): EntityArticle {
  const ret = { id: sid("s-retention"), title: "Retention to 14 days" };
  const pg = { id: sid("s-pgvector"), title: "pgvector index rebuild" };
  const nightly = { id: sid("s-nightly"), title: "Nightly backup to the NAS" };
  return {
    id: eid("nas-01"),
    title: "nas-01",
    type: "machine",
    sessionCount: 9,
    aliases: ["the NAS", "backup box"],
    topic: { id: tid("backups"), path: ["Home lab", "Backups"] },
    visibility: { kind: "space", space: "household" },
    lead: "The home NAS that holds the memory store's backups. It receives a nightly pg_dump and a copy of the wiki pages, and keeps them for 14 days.",
    lastVerified: at(0, "09:40"),
    article: [
      "# nas-01",
      "",
      "A two-disk mirror in the hall cupboard, reached as `nas-01.home.arpa`. It does one job: hold copies of the memory store.",
      "",
      "### Backups",
      "- **Nightly dump:** `pg_dump` of `memory-db` at 03:00, about 4 GB, taking roughly four minutes.",
      "- **Wiki pages:** copied after the dump finishes.",
      "- **Retention:** 14 days, pruned by `backup.sh` with `find -mtime +14`.",
      "",
      "### Storage",
      "The backup pool is a ZFS mirror with 1.8 TB free. Snapshots are read-only to the backup user.",
      "",
      "### Restoring",
      "1. Stop the workers.",
      "2. Restore the newest dump with `pg_restore --clean`.",
      "3. Start the workers and check **Stats**.",
      "",
      "### Current facts",
      "- **backup-time**: 03:00 nightly (as of today)",
      "- **retention**: 14 days (as of Nov 11)",
    ].join("\n"),
    facts: [
      { id: "f-role" as FactId, key: "Role", value: "Backup target for the memory store", since: at(7, "20:10"), pinned: false, sources: [{ session: nightly, at: at(7, "20:10"), value: "Backup target for the memory store" }] },
      { id: "f-status" as FactId, key: "Status", value: "Online", since: at(0, "09:40"), pinned: false, sources: [{ session: pg, at: at(0, "09:40"), value: "Online" }] },
      {
        id: "f-backup" as FactId, key: "Backup time", value: "03:00 nightly", since: at(0, "09:40"), pinned: false,
        sources: [{ session: pg, at: at(0, "09:40"), value: "03:00 nightly" }],
        conflict: { candidates: [{ session: pg, at: at(0, "09:40"), value: "03:00 nightly" }, { session: ret, at: at(2, "21:30"), value: "02:30 nightly" }] },
      },
      { id: "f-retention" as FactId, key: "Retention", value: "14 days", since: at(2, "21:30"), pinned: false, sources: [{ session: ret, at: at(2, "21:30"), value: "14 days" }], previous: { value: "7 days", until: at(2, "21:30") } },
      { id: "f-backs-up" as FactId, key: "Backs up", value: "memory-db, wiki pages", since: at(7, "20:10"), pinned: false, sources: [{ session: nightly, at: at(7, "20:10"), value: "memory-db, wiki pages" }] },
      { id: "f-disks" as FactId, key: "Disks", value: "Two, mirrored", since: at(4, "10:00"), pinned: true, sources: [] },
    ],
    timeline: [
      { at: at(0, "09:40"), text: "Backup moved to 03:00 to clear the reindex window.", kind: "conflict", source: pg },
      { at: at(2, "21:30"), text: "Retention raised from 7 to 14 days.", kind: "fact", source: ret },
      { at: at(4, "10:00"), text: "You added Disks and pinned it.", kind: "new" },
      { at: at(7, "20:10"), text: "Set up as the nightly backup target.", kind: "filed", source: nightly },
    ],
    connected: [
      { id: eid("memory-db"), title: "memory-db", sharedSessions: 7 },
      { id: eid("workstation"), title: "workstation", sharedSessions: 3 },
      { id: eid("embed-server"), title: "embed-server", sharedSessions: 2 },
    ],
    sessions: [],
    tags: [
      { key: "area", value: "storage", state: "applied" },
      { key: "project", value: "home-lab", state: "applied" },
    ],
    freshness: "sample",
  };
}

export const entityLeads: Record<string, string> = {
  workstation: "Phil's desktop. Runs the local rh hub, the harnesses and most agent sessions.",
  "lab-server": "A rack box in the home lab that runs the team hub when it is on.",
  "memory-db": "The Postgres database behind the memory store, with pgvector for search.",
  "embed-server": "The local service that turns text into embeddings for search.",
  "codex-hook": "The Codex hook that posts finished sessions to rh.",
  phil: "The person who owns this hub.",
  "rivethub-runtime": "The repository for the rh runtime.",
  "nomic-embed": "The embedding model the embedder job uses.",
  "qwen-27b": "The local model behind the categorizer.",
};

export const entityFacts: Record<string, [string, string][]> = {
  Linux: [["Role", "Local hub and main workstation"], ["OS", "Omarchy (Linux)"], ["Status", "Online"]],
  "memory-db": [["Engine", "Postgres 17 with pgvector"], ["Lives on", "workstation"], ["Index", "HNSW"]],
  "embed-server": [["Port", "8089"], ["Model", "nomic-embed"]],
  "codex-hook": [["Config", "~/.codex/config.toml"], ["State", "Failing with 401"]],
  "lab-server": [["Status", "Offline since Tue"]],
};

// Sessions

interface SessionSeed {
  id: string;
  title: string;
  harness: string;
  days: number;
  at: string;
  end?: string;
  n: number;
  topic?: string;
  gist: string;
  cwd?: string;
  kept?: boolean;
  space?: string;
  entities?: string[];
}

export const sessionSeeds: SessionSeed[] = [
  { id: "s-change-stream", title: "Wire the memory change stream", harness: "claude-code", days: 0, at: "14:02", end: "14:50", n: 88, topic: "rh-08", gist: "Topic and capture events replace the live feed.", cwd: "~/rivethub-runtime", entities: ["rivethub-runtime", "memory-db"] },
  { id: "s-visibility", title: "Untangle session visibility", harness: "claude-code", days: 0, at: "12:30", end: "13:20", n: 52, topic: "rh-08", gist: "Visibility moves from the live registry to tenancy.", cwd: "~/rivethub-runtime", entities: ["rivethub-runtime"] },
  { id: "s-codex-hook", title: "Why the codex hook stopped posting", harness: "codex", days: 0, at: "11:58", end: "12:20", n: 31, topic: "capture-hooks", gist: "The hook kept an old capture token after rotation.", cwd: "~/rivethub-runtime", entities: ["codex-hook", "workstation"] },
  { id: "s-pgvector", title: "pgvector index rebuild", harness: "grok-build", days: 0, at: "09:40", end: "10:15", n: 47, topic: "postgres", gist: "Moved the NAS backup to 03:00 to clear the reindex.", cwd: "~/homelab", entities: ["memory-db", "nas-01"], space: "household" },
  { id: "s-model-roles", title: "Model roles config", harness: "codex", days: 1, at: "16:10", end: "16:55", n: 40, topic: "rh-08", gist: "memory.models with a default and four roles.", cwd: "~/rivethub-runtime" },
  { id: "s-plugin-host", title: "Plug-in host scope", harness: "codex", days: 1, at: "11:20", end: "11:45", n: 22, topic: "rh-08", gist: "Kept for 0.8, then reconsidered.", cwd: "~/rivethub-runtime" },
  { id: "s-settings-models", title: "Sketch Settings › Models", harness: "claude-code", days: 1, at: "09:05", end: "09:40", n: 28, gist: "Cards per job with a model picker.", cwd: "~/rivethub-desktop" },
  { id: "s-retention", title: "Retention to 14 days", harness: "claude-code", days: 2, at: "21:12", end: "21:40", n: 64, topic: "backups", gist: "Raised retention after checking disk headroom.", cwd: "~/homelab", kept: true, space: "household", entities: ["nas-01", "memory-db"] },
  { id: "codex:restore-drill", title: "Rehearse a backup restore", harness: "codex", days: 2, at: "17:00", end: "17:40", n: 6, topic: "backups", gist: "Restored a test backup in a sandbox and verified the inventory." },
  { id: "s-zram", title: "Try zram on workstation", harness: "cursor", days: 3, at: "20:00", end: "20:30", n: 18, gist: "Enabled zram with zstd and measured swap use.", cwd: "~" },
  { id: "s-waybar", title: "Waybar clock format", harness: "opencode", days: 4, at: "08:15", end: "08:25", n: 9, gist: "Twenty-four hour clock with the date on hover.", cwd: "~/.config" },
  { id: "s-snapshots", title: "Lock down snapshot permissions", harness: "grok-build", days: 5, at: "18:30", end: "19:00", n: 26, topic: "backups", gist: "Snapshots read-only to the backup user.", cwd: "~/homelab", entities: ["nas-01"] },
  { id: "s-embed-timeout", title: "Embed endpoint timeout under load", harness: "grok-build", days: 5, at: "10:04", end: "10:40", n: 35, gist: "Raised the client timeout and capped batch size.", cwd: "~/homelab", entities: ["embed-server"] },
  { id: "s-nightly", title: "Nightly backup to the NAS", harness: "claude-code", days: 7, at: "20:10", end: "21:00", n: 70, topic: "backups", gist: "Set up pg_dump and wiki copy to nas-01.", cwd: "~/homelab", entities: ["nas-01", "memory-db"] },
];

export const sessionTags: Record<string, TagAssignment[]> = {
  "s-retention": [
    { key: "area", value: "storage", state: "applied" },
    { key: "kind", value: "change", state: "suggested" },
  ],
};

export const sessionChanges: Record<string, { kind: Change["kind"]; subject: SubjectRef; text: string }[]> = {
  "s-change-stream": [
    { kind: "decision", subject: { kind: "topic", id: tid("rh-08"), title: "rh 0.8 memory cut" }, text: "The memory profile is the only gateway surface." },
    { kind: "new", subject: { kind: "topic", id: tid("change-stream"), title: "Memory change stream" }, text: "New subtopic under rh 0.8 memory cut." },
  ],
  "s-codex-hook": [{ kind: "fact", subject: { kind: "entity", id: eid("codex-hook"), title: "Codex hook" }, text: "Fails with 401 after the capture token rotates." }],
  "s-pgvector": [
    { kind: "conflict", subject: { kind: "entity", id: eid("nas-01"), title: "nas-01" }, text: "Backup time is 03:00 here, 02:30 in an earlier session." },
    { kind: "fact", subject: { kind: "entity", id: eid("memory-db"), title: "memory-db" }, text: "HNSW index rebuilt after migration 0057." },
  ],
  "s-retention": [
    { kind: "fact", subject: { kind: "entity", id: eid("nas-01"), title: "nas-01" }, text: "Retention 7 → 14 days" },
    { kind: "fact", subject: { kind: "entity", id: eid("nas-01"), title: "nas-01" }, text: "Backup time 02:30" },
    { kind: "filed", subject: { kind: "topic", id: tid("backups"), title: "Backups" }, text: "Cited in History" },
  ],
  "s-visibility": [{ kind: "decision", subject: { kind: "topic", id: tid("rh-08"), title: "rh 0.8 memory cut" }, text: "Connect adds hook and MCP entries only when missing." }],
};

export function retentionSummary(): LegacySummaryNode {
  const leaf = (a: number, b: number, text: string): LegacySummaryNode => ({ level: "leaf", text, messageRange: [a, b], children: [] });
  return {
    level: "root",
    title: "Whole session",
    text: "Raised backup retention on nas-01 from 7 to 14 days. Before changing anything the agent checked pool headroom (1.8 TB free against about 4 GB a night), then edited the prune window in the backup script and confirmed the next run keeps the extra week. Along the way it recorded that the nightly dump runs at 02:30 and takes about four minutes.",
    messageRange: [1, 64],
    model: "claude-cli opus",
    at: at(2, "21:45"),
    children: [
      {
        level: "branch", title: "Checking headroom", text: "Measured free space and nightly dump size before changing anything.", messageRange: [1, 22], children: [
          leaf(1, 8, "Asked to raise retention to two weeks after checking for room."),
          leaf(9, 15, "zpool list showed 1.8 TB free on the backup pool."),
          leaf(16, 22, "The last seven dumps averaged about 4 GB each."),
        ],
      },
      {
        level: "branch", title: "Changing retention", text: "Edited the prune window and dry-ran it.", messageRange: [23, 48], children: [
          leaf(23, 31, "Found the prune window as a 7-day find -mtime in backup.sh."),
          leaf(32, 40, "Changed it to 14 days and kept the dump time at 02:30."),
          leaf(41, 48, "Dry-run listed nothing to delete, as expected for the first week."),
        ],
      },
      {
        level: "branch", title: "Confirming the next run", text: "Checked the timer and the expected disk use after two weeks.", messageRange: [49, 64], children: [
          leaf(49, 56, "systemctl list-timers showed the next run at 02:30."),
          leaf(57, 64, "Two weeks of dumps will use about 56 GB."),
        ],
      },
    ],
  };
}

const fillerSteps = ["Ran zfs list -o name,used,avail", "Ran du -sh /backups/memory-db", "Ran ls -lh /backups", "Read backup.sh", "Ran grep -n mtime backup.sh", "Ran systemctl status nas-backup.timer", "Read /etc/fstab", "Ran df -h /backups"];

export function retentionTranscript(): TranscriptTurn[] {
  const script: [TranscriptTurn["role"], string, string?][] = [
    ["user", "Bump the NAS backup retention to two weeks. Check there is room first."],
    ["assistant", "I'll check free space on the backup pool and the size of recent dumps before changing anything.", "Ran zpool list"],
    ["assistant", "The pool has 1.8 TB free and a nightly dump is about 4 GB, so 14 days fits easily.", "Ran 2 commands"],
    ["user", "Good. Where is the prune window set?"],
    ["assistant", "backup.sh deletes dumps with find -mtime +7. That is the 7-day window.", "Read backup.sh"],
    ["assistant", "Retention is now 14 days in the backup script. The dump still runs at 02:30 and takes about four minutes.", "Edited backup.sh"],
    ["assistant", "A dry run lists nothing to delete, as expected for the first week.", "Ran backup.sh --dry-run"],
    ["user", "When is the next run?"],
    ["assistant", "The timer fires next at 02:30. Two weeks of dumps will use about 56 GB.", "Ran systemctl list-timers"],
    ["user", "Thanks."],
  ];
  const turns: TranscriptTurn[] = [];
  const anchors = [1, 2, 12, 23, 26, 33, 42, 49, 52, 64];
  let s = 0;
  for (let i = 1; i <= 64; i++) {
    const hit = anchors.indexOf(i);
    const minute = Math.round(((i - 1) / 63) * 28);
    const when = at(2, `21:${String(12 + minute).padStart(2, "0")}`);
    if (hit >= 0) {
      const [role, text, tool] = script[hit] ?? ["assistant", ""];
      const parts: TranscriptTurn["parts"] = [{ kind: "text", text }];
      if (tool) parts.push({ kind: "tool", name: tool.split(" ")[1] ?? "tool", summary: tool });
      turns.push({ index: i, role, at: when, parts });
      s = hit;
    } else {
      turns.push({ index: i, role: "assistant", at: when, parts: [{ kind: "tool", name: "shell", summary: fillerSteps[(i + s) % fillerSteps.length]! }] });
    }
  }
  return turns;
}

export const resumeCommands: Record<string, string> = {
  "claude-code": "claude --resume",
  codex: "codex resume",
  "grok-build": "grok resume",
  cursor: "cursor-agent --resume",
  opencode: "opencode --session",
};

// Review

const ev = (session: string, title: string, days: number, hhmm: string, quote: string, highlight?: string): ReviewItem["evidence"][number] => {
  const e: ReviewItem["evidence"][number] = { session: { id: sid(session), title }, at: at(days, hhmm), quote };
  if (highlight) e.highlight = highlight;
  return e;
};

export function reviewQueue(): ReviewItem[] {
  const rid = (s: string) => s as ReviewItemId;
  const nas: SubjectRef = { kind: "entity", id: eid("nas-01"), title: "nas-01" };
  const session = (id: string): SubjectRef => ({ kind: "session", id: sid(id), title: sessionSeeds.find((s) => s.id === id)?.title ?? id });
  return [
    {
      id: rid("r-backup-time"), group: "conflict", subject: nas, text: "Backup time", before: "02:30 nightly", after: "03:00 nightly",
      options: [
        { label: "03:00", value: "03:00 nightly", source: { session: { id: sid("s-pgvector"), title: "pgvector index rebuild" }, at: at(0, "09:40"), value: "03:00 nightly" } },
        { label: "02:30", value: "02:30 nightly", source: { session: { id: sid("s-retention"), title: "Retention to 14 days" }, at: at(2, "21:30"), value: "02:30 nightly" } },
      ],
      evidence: [
        ev("s-pgvector", "pgvector index rebuild", 0, "09:40", "Moved the NAS backup to 03:00 so it no longer overlaps the 02:45 reindex.", "03:00"),
        ev("s-retention", "Retention to 14 days", 2, "21:30", "The nightly dump at 02:30 takes about four minutes.", "02:30"),
      ],
      createdAt: at(0, "09:41"),
    },
    {
      id: rid("r-codex-401"), group: "fact", subject: { kind: "entity", id: eid("codex-hook"), title: "Codex hook" }, text: "Fails with 401 after the capture token rotates.", after: "State: Fails with 401 after token rotation",
      evidence: [ev("s-codex-hook", "Why the codex hook stopped posting", 0, "12:05", "Every post since Monday returns 401. The hook still sends the token from before the rotation.", "401")],
      createdAt: at(0, "12:21"),
    },
    {
      id: rid("r-hnsw"), group: "fact", subject: { kind: "entity", id: eid("memory-db"), title: "memory-db" }, text: "HNSW index rebuilt after migration 0057.", after: "Index: HNSW, rebuilt after 0057",
      evidence: [ev("s-pgvector", "pgvector index rebuild", 0, "10:02", "Rebuilt the HNSW index once migration 0057 finished. Search latency is back to 40 ms.", "HNSW")],
      createdAt: at(0, "10:16"),
    },
    {
      id: rid("r-embed-port"), group: "fact", subject: { kind: "entity", id: eid("embed-server"), title: "embed-server" }, text: "Caps batches at 64 inputs.", after: "Batch limit: 64",
      evidence: [ev("s-embed-timeout", "Embed endpoint timeout under load", 5, "10:30", "Capped the batch size at 64 so a single request stays under the timeout.", "64")],
      createdAt: at(5, "10:41"),
    },
    {
      id: rid("r-embed-host"), group: "new-entity", subject: { kind: "entity", id: eid("embed-host"), title: "embed-host" }, text: "A machine that serves the embedding model on the LAN.", after: "Machine · Home lab",
      evidence: [ev("s-embed-timeout", "Embed endpoint timeout under load", 5, "10:12", "The embed-host box on the LAN serves nomic-embed for every client.", "embed-host")],
      createdAt: at(5, "10:41"),
    },
    {
      id: rid("r-qwen"), group: "new-entity", subject: { kind: "entity", id: eid("hermes-cli"), title: "hermes-cli" }, text: "The CLI that runs local models for the categorizer.", after: "Software",
      evidence: [ev("s-model-roles", "Model roles config", 1, "16:30", "The categorizer goes through hermes-cli with qwen-27b.", "hermes-cli")],
      createdAt: at(1, "16:56"),
    },
    { id: rid("r-file-settings"), group: "filing", subject: session("s-settings-models"), text: "→ Desktop app › Settings", after: "desktop-settings", evidence: [ev("s-settings-models", "Sketch Settings › Models", 1, "09:10", "Let's sketch the Models section of Settings for the desktop app.")], createdAt: at(1, "09:41") },
    { id: rid("r-file-embed"), group: "filing", subject: session("s-embed-timeout"), text: "→ Home lab › Postgres", after: "postgres", evidence: [ev("s-embed-timeout", "Embed endpoint timeout under load", 5, "10:04", "Search requests time out when the embed endpoint is under load.")], createdAt: at(5, "10:41") },
    { id: rid("r-file-zram"), group: "filing", subject: session("s-zram"), text: "→ Omarchy setup", after: "omarchy", evidence: [ev("s-zram", "Try zram on workstation", 3, "20:00", "Turn on zram on workstation and see if swap use drops.")], createdAt: at(3, "20:31") },
    { id: rid("r-file-waybar"), group: "filing", subject: session("s-waybar"), text: "→ Omarchy setup", after: "omarchy", evidence: [ev("s-waybar", "Waybar clock format", 4, "08:15", "Make the Waybar clock 24-hour and put the date in the tooltip.")], createdAt: at(4, "08:26") },
    { id: rid("r-tag-change"), group: "tag", subject: session("s-retention"), text: "Add kind: change", after: "kind: change", evidence: [ev("s-retention", "Retention to 14 days", 2, "21:33", "Retention is now 14 days in the backup script.")], createdAt: at(2, "21:46") },
    { id: rid("r-tag-storage"), group: "tag", subject: session("s-snapshots"), text: "Add area: storage", after: "area: storage", evidence: [ev("s-snapshots", "Lock down snapshot permissions", 5, "18:40", "Snapshots are now read-only to the backup user.")], createdAt: at(5, "19:01") },
    { id: rid("r-tidy-alias"), group: "tidy", subject: nas, text: "Merge “the NAS” into nas-01", before: "the NAS", after: "nas-01", evidence: [ev("s-nightly", "Nightly backup to the NAS", 7, "20:15", "Copy the dump to the NAS every night.", "the NAS")], createdAt: at(7, "21:01") },
    { id: rid("r-tidy-close"), group: "tidy", subject: { kind: "topic", id: tid("change-stream"), title: "Memory change stream" }, text: "Close the topic. Its last 3 sessions say it is done.", after: "closed", evidence: [ev("s-change-stream", "Wire the memory change stream", 0, "14:48", "That finishes the change stream. Everything else moves to tenancy.")], createdAt: at(0, "14:51") },
  ];
}

// Settings

export const harnesses: HarnessStatus[] = [
  { id: "claude-code", name: "Claude Code", found: true, path: "~/.claude/settings.json", version: "2.4.1", capture: { method: "hook", state: "receiving", lastCaptureAt: at(0, "14:50"), detail: "hook · ~/.claude/settings.json" }, recall: { state: "connected", detail: "Yes" }, canConnect: true },
  { id: "codex", name: "Codex", found: true, path: "~/.codex/config.toml", capture: { method: "hook", state: "stale", lastCaptureAt: at(3, "11:00"), detail: "hook · ~/.codex/config.toml" }, recall: { state: "not-connected", detail: "Not connected" }, canConnect: true },
  { id: "grok-build", name: "Grok Build", found: true, capture: { method: "hook", state: "receiving", lastCaptureAt: at(0, "10:15"), detail: "hook" }, recall: { state: "connected", detail: "Yes" }, canConnect: true },
  { id: "opencode", name: "opencode", found: true, capture: { method: "plugin", state: "not-connected", detail: "plug-in" }, recall: { state: "not-connected", detail: "Not connected" }, canConnect: true },
  { id: "cursor", name: "Cursor", found: true, capture: { method: "store-scan", state: "receiving", lastCaptureAt: at(0, "11:40"), detail: "reads its own store every 5 min" }, recall: { state: "connected", detail: "Yes" }, canConnect: false },
  { id: "antigravity", name: "Antigravity", found: true, capture: { method: "client-push", state: "receiving", lastCaptureAt: at(2, "16:00"), detail: "sent by T3" }, recall: { state: "elsewhere", detail: "Set up in T3" }, canConnect: false },
];

export const modelJobs: ModelJob[] = [
  { role: "default", provider: "claude-cli", model: "opus", inheritsDefault: false, health: "healthy", detail: "Healthy", queued: 0 },
  { role: "summarizer", inheritsDefault: true, health: "healthy", detail: "Healthy", queued: 3 },
  { role: "categorizer", provider: "hermes-cli", model: "qwen-27b", inheritsDefault: false, health: "slow", detail: "Slow · 9 s a call", queued: 12 },
  { role: "wiki-writer", provider: "claude-cli", model: "sonnet", inheritsDefault: false, health: "healthy", detail: "Healthy", queued: 0 },
  { role: "embedder", provider: "local-embed", model: "nomic", inheritsDefault: false, health: "healthy", detail: "Healthy · 41 ms", queued: 0 },
];

export const hubs: Hub[] = [
  { id: "workstation" as HubId, name: "workstation", kind: "local", url: "#", online: true, detail: "Local · this machine · 1,284 sessions", current: true },
  { id: "household" as HubId, name: "household", kind: "team", url: "#", online: true, detail: "Team server · 3 people · 2 spaces", current: false },
  { id: "lab-server" as HubId, name: "lab-server", kind: "team", url: "#", online: false, detail: "Offline since Tue", current: false },
];

export const account: Account = {
  email: "phil@example.com",
  updateSource: "rivethub-cloud",
  channel: "stable",
  autoDownload: true,
  version: "0.8.0",
  pendingUpdate: { version: "0.8.1", notesUrl: "https://github.com/rivethub/rivethub/releases" },
  crashReports: true,
  usageCounts: true,
};

export const activityLevels = [0, 1, 0, 2, 1, 0, 0, 1, 3, 2, 0, 1, 2, 0, 0, 1, 0, 0, 2, 1, 0, 3, 0, 1, 2, 0, 0, 0, 1, 2, 3] as const;
