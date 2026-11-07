import type {
  Account,
  Change,
  Decision,
  EntityArticle,
  EntityId,
  Fact,
  FactId,
  FactSource,
  HarnessStatus,
  Hub,
  HubId,
  IsoTime,
  ModelJob,
  ReviewItem,
  ReviewItemId,
  SessionDetail,
  SessionId,
  SummaryNode,
  TopicId,
  TranscriptTurn,
  Visibility,
} from "@rivethub/contracts";

export const at = (stamp: string): IsoTime => `${stamp}:00.000Z` as IsoTime;
/** The sample world's clock. Every relative time in the fixtures hangs off this instant. */
export const NOW = at("2026-11-06T14:30");

const T = (id: string) => `t-${id}` as TopicId;
const E = (id: string) => id as EntityId;
const S = (id: string) => id as SessionId;
const F = (id: string) => id as FactId;
const R = (id: string) => id as ReviewItemId;

const PRIVATE: Visibility = { kind: "private" };

export interface TopicRec {
  id: TopicId;
  name: string;
  parentId?: TopicId;
  status: "open" | "closed";
  aliases: string[];
  folder?: string;
  visibility: Visibility;
  lead: string;
  current?: string;
  decisions: Decision[];
  tags: { key: string; value: string; state: "applied" | "suggested" }[];
  lastActivity?: IsoTime;
}

export interface SessionRec {
  detail: SessionDetail;
  turns: TranscriptTurn[];
  summary?: SummaryNode;
}

export type Effect =
  | { kind: "fact"; entity: EntityId; key: string; value: string }
  | { kind: "place"; session: SessionId; topic: TopicId }
  | { kind: "new-entity"; id: EntityId; title: string; entityType: EntityArticle["type"]; lead: string }
  | { kind: "tag"; session: SessionId; key: string; value: string }
  | { kind: "merge"; from: TopicId; into: TopicId }
  | { kind: "none" };

export interface World {
  topics: TopicRec[];
  entities: EntityArticle[];
  sessions: SessionRec[];
  review: ReviewItem[];
  effects: Map<string, Effect>;
  harnesses: HarnessStatus[];
  jobs: ModelJob[];
  hubs: Hub[];
  account: Account;
  activityByDay: { date: string; level: 0 | 1 | 2 | 3 | 4 }[];
}

const topic = (
  id: string,
  name: string,
  rest: Partial<Omit<TopicRec, "id" | "name" | "parentId">> & { parent?: string },
): TopicRec => {
  const { parent, ...fields } = rest;
  return {
    id: T(id),
    name,
    ...(parent === undefined ? {} : { parentId: T(parent) }),
    status: "open",
    aliases: [],
    visibility: PRIVATE,
    lead: name,
    decisions: [],
    tags: [],
    ...fields,
  };
};

const decision = (id: string, text: string, when: string, superseded = false, source?: [string, string]): Decision => ({
  id,
  text,
  at: at(when),
  superseded,
  ...(source ? { source: { id: S(source[0]), title: source[1] } } : {}),
});

function topics(): TopicRec[] {
  return [
    topic("rivethub", "RivetHub", {
      lead: "The memory runtime and the apps built on it.",
      aliases: ["rivet"],
      folder: "~/rivethub",
      lastActivity: at("2026-11-06T14:02"),
      tags: [{ key: "project", value: "rivethub", state: "applied" }],
    }),
    topic("rh-runtime", "rh runtime", {
      parent: "rivethub",
      lead: "The Rust gateway, the memory store and the workers that keep it current.",
      aliases: ["runtime", "rh"],
      folder: "~/rivethub-runtime",
      lastActivity: at("2026-11-06T14:02"),
    }),
    topic("rh-08", "rh 0.8 memory cut", {
      parent: "rh-runtime",
      lead: "The 0.8 cut makes memory the product: topics, entities and review replace the live feed.",
      current:
        "Topic and capture events replace the live feed. The memory profile is the only gateway surface, and each worker role names its own model.",
      folder: "~/rivethub-runtime",
      aliases: ["0.8", "memory cut"],
      lastActivity: at("2026-11-06T14:02"),
      decisions: [
        decision("d-1", "The memory profile is the only gateway surface.", "2026-11-06T13:40", false, [
          "claude-code:wire-stream",
          "Wire the memory change stream",
        ]),
        decision("d-2", "Each worker role names its own model under memory.models.", "2026-11-06T10:20", false, [
          "codex:model-roles",
          "Model roles config",
        ]),
        decision(
          "d-3",
          "Connect adds hook and MCP entries only when missing, with a diff and a backup.",
          "2026-11-06T09:05",
        ),
        decision("d-4", "Keep the plug-in host for 0.8.", "2026-11-05T16:30", true, [
          "codex:plugin-host",
          "Plug-in host scope",
        ]),
      ],
      tags: [{ key: "topic", value: "memory", state: "applied" }],
    }),
    topic("capture-hooks", "Capture hooks", {
      parent: "rh-runtime",
      lead: "How each harness posts its sessions to memory, and what breaks when it stops.",
      current: "Claude Code, Grok Build and Cursor are receiving. The Codex hook stopped three days ago.",
      lastActivity: at("2026-11-06T11:58"),
      decisions: [decision("d-5", "Hooks post to the local gateway, never straight to a team server.", "2026-11-02T12:00")],
    }),
    topic("desktop-app", "Desktop app", {
      parent: "rivethub",
      lead: "The memory manager app: Today, Review, Topics, Entities and Sessions.",
      lastActivity: at("2026-11-03T16:00"),
      aliases: ["app"],
    }),
    topic("plugins", "Plug-ins", {
      parent: "rivethub",
      lead: "Plug-in host, scaffolding and the plug-in creator.",
      lastActivity: at("2026-11-05T15:10"),
    }),
    topic("home-lab", "Home lab", {
      lead: "The machines and services at home that run memory and backups.",
      aliases: ["homelab"],
      lastActivity: at("2026-11-05T09:40"),
    }),
    topic("backups", "Backups", {
      parent: "home-lab",
      lead: "Nightly dumps of the memory store and the wiki, kept on nas-01.",
      current: "pg_dump and a wiki copy run nightly to nas-01. Retention is 14 days since Nov 4.",
      folder: "~/homelab/backups",
      lastActivity: at("2026-11-05T09:40"),
      decisions: [
        decision("d-6", "Keep 14 days of nightly dumps on nas-01.", "2026-11-04T21:40", false, [
          "claude-code:retention",
          "Retention to 14 days",
        ]),
        decision("d-7", "Keep 7 days of nightly dumps on nas-01.", "2026-10-30T20:10", true),
        decision("d-8", "Snapshots are read-only to the backup user.", "2026-11-01T18:50", false, [
          "grok-build:snapshot-perms",
          "Lock down snapshot permissions",
        ]),
      ],
      tags: [{ key: "topic", value: "backups", state: "applied" }],
    }),
    topic("postgres", "Postgres", {
      parent: "home-lab",
      lead: "The memory database, its migrations and its vector index.",
      current: "memory-db runs migration 0057. The HNSW index was rebuilt after it.",
      lastActivity: at("2026-11-05T09:40"),
    }),
    topic("omarchy", "Omarchy setup", {
      lead: "Desktop configuration for the workstation.",
      lastActivity: at("2026-10-29T19:00"),
    }),
    topic("side-projects", "Side projects", {
      lead: "Small experiments that do not belong anywhere else yet.",
      status: "closed",
      lastActivity: at("2026-10-27T12:00"),
    }),
  ];
}

const src = (session: string, title: string, when: string, value: string): FactSource => ({
  session: { id: S(session), title },
  at: at(when),
  value,
});

const SRC_PGVECTOR = ["grok-build:pgvector", "pgvector index rebuild"] as const;
const SRC_RETENTION = ["claude-code:retention", "Retention to 14 days"] as const;
const SRC_NIGHTLY = ["claude-code:nightly", "Nightly backup to the NAS"] as const;

const fact = (id: string, key: string, value: string, since: string, rest: Partial<Fact> = {}): Fact => ({
  id: F(id),
  key,
  value,
  since: at(since),
  pinned: false,
  sources: [],
  ...rest,
});

function entities(): EntityArticle[] {
  const nas: EntityArticle = {
    id: E("nas-01"),
    title: "nas-01",
    type: "machine",
    sessionCount: 0,
    aliases: ["nas", "backup box"],
    topic: { id: T("backups"), path: ["Home lab", "Backups"] },
    visibility: PRIVATE,
    lead: "The home NAS. It is the nightly backup target for the memory store and the wiki.",
    facts: [
      fact("nas-role", "Role", "Backup target for the memory store", "2026-10-30T20:10", {
        sources: [src(SRC_NIGHTLY[0], SRC_NIGHTLY[1], "2026-10-30T20:10", "Backup target for the memory store")],
      }),
      fact("nas-status", "Status", "Online", "2026-11-05T09:40", {
        sources: [src(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T09:40", "Online")],
      }),
      fact("nas-time", "Backup time", "03:00 nightly", "2026-11-05T09:40", {
        sources: [src(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T09:40", "03:00 nightly")],
        conflict: {
          candidates: [
            src(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T09:40", "03:00 nightly"),
            src(SRC_RETENTION[0], SRC_RETENTION[1], "2026-11-04T21:12", "02:30 nightly"),
          ],
        },
      }),
      fact("nas-retention", "Retention", "14 days", "2026-11-04T21:12", {
        sources: [src(SRC_RETENTION[0], SRC_RETENTION[1], "2026-11-04T21:12", "14 days")],
        previous: { value: "7 days", until: at("2026-11-04T21:12") },
      }),
      fact("nas-backs-up", "Backs up", "memory-db, wiki pages", "2026-10-30T20:10", {
        sources: [src(SRC_NIGHTLY[0], SRC_NIGHTLY[1], "2026-10-30T20:10", "memory-db, wiki pages")],
      }),
      fact("nas-disks", "Disks", "Two, mirrored", "2026-11-02T08:15", { pinned: true }),
    ],
    timeline: [
      {
        at: at("2026-11-05T09:40"),
        text: "Backup moved to 03:00 to clear the reindex window.",
        kind: "conflict",
        source: { id: S(SRC_PGVECTOR[0]), title: SRC_PGVECTOR[1] },
      },
      {
        at: at("2026-11-04T21:12"),
        text: "Retention raised from 7 to 14 days.",
        kind: "fact",
        source: { id: S(SRC_RETENTION[0]), title: SRC_RETENTION[1] },
      },
      { at: at("2026-11-02T08:15"), text: "You added Disks and pinned it.", kind: "fact" },
      {
        at: at("2026-10-30T20:10"),
        text: "Set up as the nightly backup target.",
        kind: "new",
        source: { id: S(SRC_NIGHTLY[0]), title: SRC_NIGHTLY[1] },
      },
    ],
    connected: [
      { id: E("memory-db"), title: "memory-db", sharedSessions: 3 },
      { id: E("phildesk"), title: "phildesk", sharedSessions: 1 },
    ],
    sessions: [],
    tags: [{ key: "topic", value: "backups", state: "applied" }],
    freshness: "sample",
  };

  const memoryDb: EntityArticle = {
    id: E("memory-db"),
    title: "memory-db",
    type: "database",
    sessionCount: 0,
    aliases: ["memory database"],
    topic: { id: T("postgres"), path: ["Home lab", "Postgres"] },
    visibility: PRIVATE,
    lead: "The Postgres database that holds every captured session, summary and embedding.",
    facts: [
      fact("db-engine", "Engine", "Postgres 17 with pgvector", "2026-10-30T20:10"),
      fact("db-migration", "Schema", "Migration 0057", "2026-11-05T09:40", {
        sources: [src(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T09:40", "Migration 0057")],
        previous: { value: "Migration 0056", until: at("2026-11-05T09:40") },
      }),
      fact("db-index", "Vector index", "HNSW, rebuilt after migration 0057", "2026-11-05T09:40", {
        sources: [src(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T09:40", "HNSW, rebuilt after migration 0057")],
      }),
      fact("db-host", "Runs on", "phildesk", "2026-10-30T20:10", { pinned: true }),
    ],
    timeline: [
      {
        at: at("2026-11-05T09:40"),
        text: "HNSW index rebuilt after migration 0057.",
        kind: "fact",
        source: { id: S(SRC_PGVECTOR[0]), title: SRC_PGVECTOR[1] },
      },
    ],
    connected: [
      { id: E("nas-01"), title: "nas-01", sharedSessions: 3 },
      { id: E("embed-server"), title: "embed-server", sharedSessions: 2 },
    ],
    sessions: [],
    tags: [],
    freshness: "sample",
  };

  const phildesk: EntityArticle = {
    id: E("phildesk"),
    title: "phildesk",
    type: "machine",
    sessionCount: 0,
    aliases: ["desk", "workstation"],
    visibility: PRIVATE,
    lead: "The workstation. It runs rh locally, memory-db and the harnesses.",
    facts: [
      fact("pd-os", "OS", "Arch Linux", "2026-10-28T19:00", { pinned: true }),
      fact("pd-gpu", "GPU", "24 GB", "2026-11-03T16:00"),
      fact("pd-hub", "Hub", "Local, this machine", "2026-10-30T20:10"),
    ],
    timeline: [{ at: at("2026-10-28T19:00"), text: "Omarchy set up as the desktop.", kind: "new" }],
    connected: [
      { id: E("memory-db"), title: "memory-db", sharedSessions: 2 },
      { id: E("embed-server"), title: "embed-server", sharedSessions: 1 },
    ],
    sessions: [],
    tags: [],
    freshness: "sample",
  };

  const embed: EntityArticle = {
    id: E("embed-server"),
    title: "embed-server",
    type: "service",
    sessionCount: 0,
    aliases: ["embedder"],
    topic: { id: T("postgres"), path: ["Home lab", "Postgres"] },
    visibility: PRIVATE,
    lead: "Serves the embedding model that makes search work.",
    facts: [
      fact("es-model", "Model", "nomic-embed-text", "2026-10-30T20:10"),
      fact("es-latency", "Latency", "41 ms a call", "2026-11-04T10:00"),
      fact("es-endpoint", "Timeout", "30 s under load", "2026-11-01T10:04", {
        sources: [src("grok-build:embed-timeout", "Embed endpoint timeout under load", "2026-11-01T10:04", "30 s under load")],
        previous: { value: "10 s", until: at("2026-11-01T10:04") },
      }),
    ],
    timeline: [
      {
        at: at("2026-11-01T10:04"),
        text: "Timeout raised after calls failed under load.",
        kind: "fact",
        source: { id: S("grok-build:embed-timeout"), title: "Embed endpoint timeout under load" },
      },
    ],
    connected: [{ id: E("memory-db"), title: "memory-db", sharedSessions: 2 }],
    sessions: [],
    tags: [],
    freshness: "sample",
  };

  const codexHook: EntityArticle = {
    id: E("codex-hook"),
    title: "Codex hook",
    type: "software",
    sessionCount: 0,
    aliases: [],
    topic: { id: T("capture-hooks"), path: ["RivetHub", "rh runtime", "Capture hooks"] },
    visibility: PRIVATE,
    lead: "The hook that posts Codex sessions to memory.",
    facts: [fact("ch-config", "Config", "~/.codex/config.toml", "2026-10-30T20:10")],
    timeline: [],
    connected: [],
    sessions: [],
    tags: [],
    freshness: "sample",
  };

  return [nas, memoryDb, phildesk, embed, codexHook];
}

const ref = (kind: "topic" | "entity" | "session", id: string, title: string) =>
  ({ kind, id, title }) as Change["subject"];

interface SessionSeed {
  id: string;
  title: string;
  harness: string;
  start: string;
  end: string;
  count: number;
  topic?: string;
  gist: string;
  kept?: boolean;
  trashed?: boolean;
  state?: SessionDetail["memoryState"];
  cwd?: string;
  entities?: string[];
  changes?: Omit<Change, "at" | "source">[];
  tags?: SessionDetail["tags"];
}

function seedSession(seed: SessionSeed, topicRecs: TopicRec[]): SessionRec {
  const byId = new Map(topicRecs.map((rec) => [rec.id as string, rec]));
  const pathOf = (id: string): string[] => {
    const names: string[] = [];
    for (let at: TopicRec | undefined = byId.get(T(id)); at; at = at.parentId ? byId.get(at.parentId) : undefined) {
      names.unshift(at.name);
    }
    return names;
  };
  const sid = S(seed.id);
  const entityTitles = new Map(entities().map((entity) => [entity.id as string, entity.title]));
  const detail: SessionDetail = {
    id: sid,
    title: seed.title,
    harness: seed.harness,
    startedAt: at(seed.start),
    endedAt: at(seed.end),
    messageCount: seed.count,
    ...(seed.topic ? { topic: { id: T(seed.topic), path: pathOf(seed.topic) } } : {}),
    visibility: PRIVATE,
    kept: seed.kept ?? false,
    trashed: seed.trashed ?? false,
    memoryState: seed.state ?? "summarized",
    gist: seed.gist,
    cwd: seed.cwd ?? "~/rivethub-runtime",
    resumeCommand: `${seed.harness === "claude-code" ? "claude --resume" : seed.harness + " resume"} ${seed.id.split(":")[1]}`,
    changed: (seed.changes ?? []).map((change) => ({
      ...change,
      at: at(seed.end),
      actor: { kind: "wiki-writer" } as const,
      source: { kind: "session", id: sid, title: seed.title },
    })),
    entities: (seed.entities ?? []).map((id) => ({ id: E(id), title: entityTitles.get(id) ?? id })),
    tags: seed.tags ?? [],
  };
  return { detail, turns: [] };
}

const WORK_LINES = [
  "Reading the current state before changing anything.",
  "Running the check again to confirm the result.",
  "That matches what the log shows. Moving on to the next step.",
  "Writing the change and a note about why.",
  "Looking at how the other callers use it.",
  "The output is what I expected. Nothing else needs touching here.",
];

function synthTurns(
  seed: { start: string; end: string; count: number; title: string },
  notes: Record<number, [role: "user" | "assistant", text: string, tool?: [string, string]]> = {},
): TranscriptTurn[] {
  const begin = Date.parse(at(seed.start));
  const span = Date.parse(at(seed.end)) - begin;
  return Array.from({ length: seed.count }, (_, index) => {
    const note = notes[index];
    const role = note?.[0] ?? (index % 2 === 0 ? "user" : "assistant");
    const text =
      note?.[1] ??
      (role === "user"
        ? index === 0
          ? `Let's work on this: ${seed.title}.`
          : "Go on."
        : (WORK_LINES[index % WORK_LINES.length] ?? "Done."));
    const parts: TranscriptTurn["parts"] = [{ kind: "text", text }];
    if (note?.[2]) parts.push({ kind: "tool", name: note[2][0], summary: note[2][1] });
    else if (role === "assistant" && index % 4 === 1) {
      parts.push({ kind: "tool", name: "Bash", summary: "git status --short" });
    }
    return {
      index,
      role,
      at: new Date(begin + Math.floor((span * index) / Math.max(1, seed.count - 1))).toISOString() as IsoTime,
      parts,
    };
  });
}

const leaf = (range: [number, number], text: string, at_: string): SummaryNode => ({
  level: "leaf",
  text,
  messageRange: range,
  model: "claude-cli · sonnet",
  at: at(at_),
  children: [],
});

function retentionSummary(): SummaryNode {
  return {
    level: "root",
    title: "Retention to 14 days",
    text: "Raised the nightly dump retention on nas-01 from 7 to 14 days after checking disk headroom, kept the dump at 02:30 and confirmed the next run.",
    messageRange: [0, 63],
    model: "claude-cli · opus",
    at: at("2026-11-04T21:30"),
    children: [
      {
        level: "branch",
        title: "Checking headroom",
        text: "Measured free space and nightly dump size before changing anything.",
        messageRange: [0, 21],
        model: "claude-cli · sonnet",
        at: at("2026-11-04T20:40"),
        children: [
          leaf([0, 10], "Listed free space on nas-01: about 1.4 TB free of 2 TB.", "2026-11-04T20:25"),
          leaf([11, 21], "Measured the nightly dump at 6 GB, so 14 days is about 84 GB.", "2026-11-04T20:38"),
        ],
      },
      {
        level: "branch",
        title: "Changing retention",
        text: "Edited the prune window and dry-ran it.",
        messageRange: [22, 47],
        model: "claude-cli · sonnet",
        at: at("2026-11-04T21:05"),
        children: [
          leaf([22, 30], "Found the prune window as a 7-day find -mtime in backup.sh.", "2026-11-04T20:50"),
          leaf([31, 39], "Changed it to 14 days and kept the dump time at 02:30.", "2026-11-04T20:58"),
          leaf([40, 47], "Dry-run listed nothing to delete, as expected for the first week.", "2026-11-04T21:04"),
        ],
      },
      {
        level: "branch",
        title: "Confirming the next run",
        text: "Checked the timer and the expected disk use after two weeks.",
        messageRange: [48, 63],
        model: "claude-cli · sonnet",
        at: at("2026-11-04T21:25"),
        children: [
          leaf([48, 55], "Confirmed the systemd timer still fires at 02:30.", "2026-11-04T21:14"),
          leaf([56, 63], "Expected steady state is about 84 GB on a 2 TB mirror.", "2026-11-04T21:24"),
        ],
      },
    ],
  };
}

function sessions(topicRecs: TopicRec[]): SessionRec[] {
  const make = (seed: SessionSeed, notes?: Parameters<typeof synthTurns>[1]) => {
    const rec = seedSession(seed, topicRecs);
    rec.turns = synthTurns(seed, notes);
    return rec;
  };

  const retention = make(
    {
      id: "claude-code:retention",
      title: "Retention to 14 days",
      harness: "claude-code",
      start: "2026-11-04T20:20",
      end: "2026-11-04T21:12",
      count: 64,
      topic: "backups",
      kept: true,
      gist: "Raised retention after checking disk headroom.",
      cwd: "~/homelab/backups",
      entities: ["nas-01", "memory-db"],
      changes: [
        { kind: "fact", subject: ref("entity", "nas-01", "nas-01"), text: "Retention raised from 7 to 14 days.", actor: { kind: "wiki-writer" } },
        { kind: "decision", subject: ref("topic", "t-backups", "Backups"), text: "Keep 14 days of nightly dumps on nas-01.", actor: { kind: "wiki-writer" } },
      ],
    },
    {
      0: ["user", "How much room is left on nas-01 before I change the retention?"],
      1: ["assistant", "Checking free space and the size of a nightly dump first.", ["Bash", "df -h /mnt/backups"]],
      23: ["assistant", "The prune window is a 7-day find -mtime in backup.sh.", ["Read", "~/homelab/backups/backup.sh"]],
      33: ["assistant", "Changing it to 14 days. The dump time stays at 02:30.", ["Edit", "~/homelab/backups/backup.sh"]],
      41: ["assistant", "Dry run lists nothing to delete, which is right for the first week.", ["Bash", "backup.sh --dry-run"]],
    },
  );
  retention.summary = retentionSummary();

  const list: SessionRec[] = [
    make({
      id: "claude-code:wire-stream",
      title: "Wire the memory change stream",
      harness: "claude-code",
      start: "2026-11-06T13:10",
      end: "2026-11-06T14:02",
      count: 38,
      topic: "rh-08",
      gist: "Topic and capture events replace the live feed.",
      entities: ["memory-db"],
      state: "capturing",
      changes: [
        { kind: "decision", subject: ref("topic", "t-rh-08", "rh 0.8 memory cut"), text: "The memory profile is the only gateway surface.", actor: { kind: "wiki-writer" } },
        { kind: "new", subject: ref("topic", "t-rh-08", "Memory change stream"), text: "New subtopic under rh 0.8 memory cut.", actor: { kind: "categorizer" } },
      ],
    }),
    make({
      id: "claude-code:visibility",
      title: "Untangle session visibility",
      harness: "claude-code",
      start: "2026-11-06T09:30",
      end: "2026-11-06T10:15",
      count: 26,
      topic: "rh-08",
      gist: "Visibility moves from the live registry to tenancy.",
    }),
    make({
      id: "codex:hook-401",
      title: "Why the codex hook stopped posting",
      harness: "codex",
      start: "2026-11-06T11:20",
      end: "2026-11-06T11:58",
      count: 18,
      gist: "The hook fails with 401 after the capture token rotates.",
      entities: ["codex-hook"],
      changes: [
        { kind: "fact", subject: ref("entity", "codex-hook", "Codex hook"), text: "Fails with 401 after the capture token rotates.", actor: { kind: "wiki-writer" } },
      ],
    }),
    make({
      id: "codex:model-roles",
      title: "Model roles config",
      harness: "codex",
      start: "2026-11-05T15:00",
      end: "2026-11-05T16:00",
      count: 30,
      topic: "rh-08",
      gist: "memory.models with a default and four roles.",
    }),
    make({
      id: "codex:plugin-host",
      title: "Plug-in host scope",
      harness: "codex",
      start: "2026-11-05T14:20",
      end: "2026-11-05T15:10",
      count: 22,
      topic: "plugins",
      gist: "Kept for 0.8, then reconsidered.",
    }),
    make({
      id: "grok-build:pgvector",
      title: "pgvector index rebuild",
      harness: "grok-build",
      start: "2026-11-05T08:50",
      end: "2026-11-05T09:40",
      count: 44,
      topic: "postgres",
      gist: "Moved the NAS backup to 03:00 to clear the reindex.",
      entities: ["nas-01", "memory-db"],
      changes: [
        { kind: "conflict", subject: ref("entity", "nas-01", "nas-01"), text: "Backup time is 03:00 here, 02:30 in an earlier source.", actor: { kind: "wiki-writer" } },
        { kind: "fact", subject: ref("entity", "memory-db", "memory-db"), text: "HNSW index rebuilt after migration 0057.", actor: { kind: "wiki-writer" } },
      ],
    }),
    retention,
    make({
      id: "grok-build:snapshot-perms",
      title: "Lock down snapshot permissions",
      harness: "grok-build",
      start: "2026-11-01T17:50",
      end: "2026-11-01T18:30",
      count: 20,
      topic: "backups",
      gist: "Snapshots read-only to the backup user.",
      entities: ["nas-01"],
    }),
    make({
      id: "grok-build:embed-timeout",
      title: "Embed endpoint timeout under load",
      harness: "grok-build",
      start: "2026-11-01T09:20",
      end: "2026-11-01T10:04",
      count: 28,
      gist: "Calls failed at 10 s under load, so the timeout went to 30 s.",
      entities: ["embed-server", "memory-db"],
      state: "flagged",
    }),
    make({
      id: "claude-code:nightly",
      title: "Nightly backup to the NAS",
      harness: "claude-code",
      start: "2026-10-30T19:30",
      end: "2026-10-30T20:10",
      count: 34,
      topic: "backups",
      gist: "Set up pg_dump and wiki copy to nas-01.",
      entities: ["nas-01", "memory-db", "phildesk"],
    }),
    make({
      id: "cursor:settings-models",
      title: "Sketch Settings › Models",
      harness: "cursor",
      start: "2026-11-03T15:20",
      end: "2026-11-03T16:00",
      count: 16,
      gist: "Layout for the model jobs table.",
      cwd: "~/rivethub",
    }),
    make({
      id: "opencode:plugin-hook",
      title: "Plug-in hook for opencode",
      harness: "opencode",
      start: "2026-11-02T11:00",
      end: "2026-11-02T12:00",
      count: 24,
      topic: "capture-hooks",
      gist: "opencode captures through a plug-in, not a hook.",
      tags: [{ key: "topic", value: "capture", state: "applied" }],
    }),
    make({
      id: "opencode:cache-spike",
      title: "Spike: sqlite or postgres for the cache",
      harness: "opencode",
      start: "2026-10-31T13:00",
      end: "2026-10-31T13:40",
      count: 12,
      gist: "Compared both for a small read-through cache.",
      tags: [{ key: "project", value: "cache", state: "suggested" }],
    }),
    make({
      id: "claude-code:hello",
      title: "test",
      harness: "claude-code",
      start: "2026-10-30T09:00",
      end: "2026-10-30T09:01",
      count: 2,
      gist: "A one-word session.",
      trashed: true,
    }),
  ];
  return list;
}

const fixEffect = (entity: string, key: string, value: string): Effect => ({ kind: "fact", entity: E(entity), key, value });

function review(): { items: ReviewItem[]; effects: Map<string, Effect> } {
  const effects = new Map<string, Effect>();
  const items: ReviewItem[] = [];
  const add = (item: ReviewItem, effect: Effect) => {
    items.push(item);
    effects.set(item.id, effect);
  };
  const ev = (session: string, title: string, when: string, quote: string, highlight?: string) => ({
    session: { id: S(session), title },
    at: at(when),
    quote,
    ...(highlight ? { highlight } : {}),
  });

  add(
    {
      id: R("rv-conflict-backup"),
      group: "conflict",
      subject: ref("entity", "nas-01", "nas-01"),
      text: "Backup time",
      options: [
        { label: "03:00 nightly", value: "03:00 nightly", source: src(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T09:40", "03:00 nightly") },
        { label: "02:30 nightly", value: "02:30 nightly", source: src(SRC_RETENTION[0], SRC_RETENTION[1], "2026-11-04T21:12", "02:30 nightly") },
      ],
      evidence: [
        ev(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T09:40", "I moved the NAS backup to 03:00 so it stops colliding with the reindex.", "03:00"),
        ev(SRC_RETENTION[0], SRC_RETENTION[1], "2026-11-04T21:12", "Changed it to 14 days and kept the dump time at 02:30.", "02:30"),
      ],
      createdAt: at("2026-11-05T09:41"),
    },
    fixEffect("nas-01", "Backup time", ""),
  );

  add(
    {
      id: R("rv-fact-codex"),
      group: "fact",
      subject: ref("entity", "codex-hook", "Codex hook"),
      text: "Fails with 401 after the capture token rotates.",
      after: "Fails with 401 after the capture token rotates.",
      evidence: [ev("codex:hook-401", "Why the codex hook stopped posting", "2026-11-06T11:50", "The hook still sends the old token, which is why every post is a 401.", "401")],
      createdAt: at("2026-11-06T11:58"),
    },
    fixEffect("codex-hook", "Failure", "Fails with 401 after the capture token rotates."),
  );
  add(
    {
      id: R("rv-fact-hnsw"),
      group: "fact",
      subject: ref("entity", "memory-db", "memory-db"),
      text: "Vector index",
      before: "HNSW",
      after: "HNSW, rebuilt after migration 0057",
      evidence: [ev(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T09:30", "Index rebuilt after migration 0057. Queries are back under 50 ms.", "migration 0057")],
      createdAt: at("2026-11-05T09:40"),
    },
    fixEffect("memory-db", "Vector index", "HNSW, rebuilt after migration 0057"),
  );
  add(
    {
      id: R("rv-fact-gpu"),
      group: "fact",
      subject: ref("entity", "phildesk", "phildesk"),
      text: "GPU",
      before: "16 GB",
      after: "24 GB",
      evidence: [ev("claude-code:nightly", "Nightly backup to the NAS", "2026-10-30T19:50", "The 24 GB card has room for the embedder and the summarizer.", "24 GB")],
      createdAt: at("2026-11-03T16:00"),
    },
    fixEffect("phildesk", "GPU", "24 GB"),
  );

  add(
    {
      id: R("rv-new-embed-host"),
      group: "new-entity",
      subject: ref("entity", "embed-host", "embed-host"),
      text: "A machine that serves the embedding model on the LAN.",
      evidence: [ev("grok-build:embed-timeout", "Embed endpoint timeout under load", "2026-11-01T09:30", "embed-host answers on port 8081 and drops calls above 10 s.", "embed-host")],
      createdAt: at("2026-11-01T10:05"),
    },
    { kind: "new-entity", id: E("embed-host"), title: "embed-host", entityType: "machine", lead: "A machine that serves the embedding model on the LAN." },
  );
  add(
    {
      id: R("rv-new-pgvector"),
      group: "new-entity",
      subject: ref("entity", "pgvector", "pgvector"),
      text: "The Postgres extension that stores and searches embeddings.",
      evidence: [ev(SRC_PGVECTOR[0], SRC_PGVECTOR[1], "2026-11-05T08:55", "pgvector 0.8 builds the HNSW index in about twelve minutes.", "pgvector")],
      createdAt: at("2026-11-05T09:40"),
    },
    { kind: "new-entity", id: E("pgvector"), title: "pgvector", entityType: "software", lead: "The Postgres extension that stores and searches embeddings." },
  );

  const filing = (id: string, session: string, title: string, to: string, toName: string, when: string): void => {
    add(
      {
        id: R(id),
        group: "filing",
        subject: ref("session", session, title),
        text: `→ ${toName}`,
        after: toName,
        evidence: [ev(session, title, when, `Session about ${title.toLowerCase()}.`)],
        createdAt: at(when),
      },
      { kind: "place", session: S(session), topic: T(to) },
    );
  };
  filing("rv-file-settings", "cursor:settings-models", "Sketch Settings › Models", "desktop-app", "Desktop app › Settings", "2026-11-03T16:00");
  filing("rv-file-embed", "grok-build:embed-timeout", "Embed endpoint timeout under load", "postgres", "Home lab › Postgres", "2026-11-01T10:04");
  filing("rv-file-hook", "codex:hook-401", "Why the codex hook stopped posting", "capture-hooks", "Capture hooks", "2026-11-06T11:58");
  filing("rv-file-cache", "opencode:cache-spike", "Spike: sqlite or postgres for the cache", "side-projects", "Side projects", "2026-10-31T13:40");

  add(
    {
      id: R("rv-tag-capture"),
      group: "tag",
      subject: ref("session", "opencode:cache-spike", "Spike: sqlite or postgres for the cache"),
      text: "project: cache",
      evidence: [ev("opencode:cache-spike", "Spike: sqlite or postgres for the cache", "2026-10-31T13:40", "Treating this as the cache project.")],
      createdAt: at("2026-10-31T13:41"),
    },
    { kind: "tag", session: S("opencode:cache-spike"), key: "project", value: "cache" },
  );
  add(
    {
      id: R("rv-tag-hooks"),
      group: "tag",
      subject: ref("session", "opencode:plugin-hook", "Plug-in hook for opencode"),
      text: "topic: capture",
      evidence: [ev("opencode:plugin-hook", "Plug-in hook for opencode", "2026-11-02T12:00", "opencode loads a plug-in to capture sessions.")],
      createdAt: at("2026-11-02T12:01"),
    },
    { kind: "tag", session: S("opencode:plugin-hook"), key: "topic", value: "capture" },
  );
  add(
    {
      id: R("rv-tidy-homelab"),
      group: "tidy",
      subject: ref("topic", "t-home-lab", "Home lab"),
      text: "Merge the topic \"Homelab\" into \"Home lab\".",
      before: "Homelab",
      after: "Home lab",
      evidence: [ev("claude-code:nightly", "Nightly backup to the NAS", "2026-10-30T20:10", "Filing this under the homelab topic.")],
      createdAt: at("2026-11-04T07:00"),
    },
    { kind: "none" },
  );
  add(
    {
      id: R("rv-tidy-stale"),
      group: "tidy",
      subject: ref("topic", "t-side-projects", "Side projects"),
      text: "Close \"Side projects\", with no sessions in nine days.",
      evidence: [],
      createdAt: at("2026-11-05T07:00"),
    },
    { kind: "none" },
  );

  return { items, effects };
}

function harnesses(): HarnessStatus[] {
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      found: true,
      path: "~/.claude/settings.json",
      version: "2.1.0",
      capture: { method: "hook", state: "receiving", lastCaptureAt: at("2026-11-06T14:26"), detail: "Yes · 4 min ago" },
      recall: { state: "connected", detail: "MCP entry present" },
      canConnect: false,
    },
    {
      id: "codex",
      name: "Codex",
      found: true,
      path: "~/.codex/config.toml",
      version: "0.4.2",
      capture: { method: "hook", state: "stale", lastCaptureAt: at("2026-11-03T10:12"), detail: "Stopped · 3 days ago" },
      recall: { state: "not-connected", detail: "Not connected" },
      canConnect: true,
    },
    {
      id: "grok-build",
      name: "Grok Build",
      found: true,
      path: "~/.grok/hooks.json",
      version: "1.3.0",
      capture: { method: "hook", state: "receiving", lastCaptureAt: at("2026-11-06T12:30"), detail: "Yes · 2 h ago" },
      recall: { state: "connected", detail: "MCP entry present" },
      canConnect: false,
    },
    {
      id: "opencode",
      name: "opencode",
      found: true,
      path: "~/.config/opencode",
      version: "0.9.1",
      capture: { method: "plugin", state: "not-connected", detail: "Not connected" },
      recall: { state: "not-connected", detail: "Not connected" },
      canConnect: true,
    },
    {
      id: "cursor",
      name: "Cursor",
      found: true,
      path: "~/.cursor",
      version: "2.0.4",
      capture: { method: "store-scan", state: "receiving", lastCaptureAt: at("2026-11-06T13:30"), detail: "Reads its own store every 5 min · 1 h ago" },
      recall: { state: "connected", detail: "MCP entry present" },
      canConnect: false,
    },
    {
      id: "antigravity",
      name: "Antigravity",
      found: false,
      capture: { method: "client-push", state: "receiving", lastCaptureAt: at("2026-11-04T14:00"), detail: "Sent by T3 · 2 days ago" },
      recall: { state: "elsewhere", detail: "Set up in T3" },
      canConnect: false,
    },
  ];
}

function jobs(): ModelJob[] {
  return [
    { role: "default", provider: "claude-cli", model: "opus", inheritsDefault: false, health: "healthy", detail: "Used by any job below left on Default.", queued: 0 },
    { role: "summarizer", inheritsDefault: true, health: "healthy", detail: "Healthy · 3 waiting", queued: 3 },
    { role: "categorizer", provider: "hermes-cli", model: "qwen-27b", inheritsDefault: false, health: "slow", detail: "Slow · 9 s a call · 12 waiting", queued: 12 },
    { role: "wiki-writer", provider: "claude-cli", model: "sonnet", inheritsDefault: false, health: "healthy", detail: "Healthy", queued: 0 },
    { role: "embedder", provider: "local-embed", model: "nomic", inheritsDefault: false, health: "healthy", detail: "Healthy · 41 ms", queued: 0 },
  ];
}

function hubs(): Hub[] {
  const hub = (id: string, name: string, kind: Hub["kind"], url: string, online: boolean, detail: string, current: boolean): Hub => ({
    id: id as HubId,
    name,
    kind,
    url,
    online,
    detail,
    current,
  });
  return [
    hub("phildesk", "phildesk", "local", "https://127.0.0.1:5174", true, "Local · this machine · 1,284 sessions", true),
    hub("household", "household", "team", "https://household.example.test:5174", true, "Team server · 3 people · 2 spaces", false),
    hub("lab-server", "lab-server", "team", "https://lab-server.example.test:5174", false, "Offline since Tue", false),
  ];
}

const HEAT = [0, 1, 0, 2, 1, 0, 0, 1, 3, 2, 0, 1, 2, 0, 0, 1, 0, 0, 2, 1, 0, 3, 0, 1, 2, 0, 0, 0, 1, 2, 3, 4, 2, 3, 0] as const;

export function buildWorld(): World {
  const topicRecs = topics();
  const built = review();
  return {
    topics: topicRecs,
    entities: entities(),
    sessions: sessions(topicRecs),
    review: built.items,
    effects: built.effects,
    harnesses: harnesses(),
    jobs: jobs(),
    hubs: hubs(),
    account: {
      email: "you@example.test",
      updateSource: "rivethub-cloud",
      channel: "stable",
      autoDownload: true,
      version: "0.8.0",
      pendingUpdate: { version: "0.8.1", notesUrl: "https://example.test/rivethub/releases/0.8.1" },
      crashReports: true,
      usageCounts: true,
    },
    activityByDay: HEAT.map((level, index) => ({
      date: new Date(Date.parse(NOW) - (HEAT.length - 1 - index) * 86_400_000).toISOString().slice(0, 10),
      level: level as 0 | 1 | 2 | 3 | 4,
    })),
  };
}
