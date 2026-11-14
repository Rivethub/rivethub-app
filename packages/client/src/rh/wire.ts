import { z } from "zod";
import type { IsoTime } from "@rivethub/contracts";

/** rh sends times as epoch milliseconds in some routes and ISO strings in others. */
export const timeSchema = z.union([
  z.number().transform((ms, ctx) => {
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "not a valid epoch time" });
      return z.NEVER;
    }
    return date.toISOString() as IsoTime;
  }),
  z.string().transform((text, ctx) => {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "not a valid time string" });
      return z.NEVER;
    }
    return date.toISOString() as IsoTime;
  }),
]);

const nullish = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((value) => value ?? undefined);

export const topicRecord = z.object({
  id: z.string(),
  kind: z.string().default("work"),
  slug: z.string().optional(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  parent: nullish(z.string()),
  directory: nullish(
    z.object({ kind: z.string(), path: z.string(), node: z.string().optional() }),
  ),
  createdAt: nullish(timeSchema),
  updatedAt: nullish(timeSchema),
  closedAt: nullish(timeSchema),
  owner: nullish(z.string()),
  visibility: nullish(z.string()),
});
export type TopicRecord = z.infer<typeof topicRecord>;

export const topicSummary = topicRecord.extend({
  sessionCount: z.number().default(0),
  lastActive: nullish(timeSchema),
});
export type TopicSummary = z.infer<typeof topicSummary>;

export const topicList = z.object({ topics: z.array(topicSummary) });

export const createdTopic = z.object({ id: z.string() });

export const wikiPage = z.object({
  slug: z.string(),
  title: z.string(),
  currentState: z.string().default(""),
  article: nullish(z.string()),
  entities: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  updatedAt: nullish(timeSchema),
  lastVerified: nullish(timeSchema),
});

export const topicMention = z.object({ topicId: z.string(), name: z.string() });

export const topicPage = z.object({
  topic: topicRecord,
  page: nullish(wikiPage),
  mentions: z.array(topicMention).default([]),
});

export const topicDecision = z.object({
  id: z.string(),
  topicId: z.string().optional(),
  text: z.string(),
  status: z.enum(["active", "superseded"]),
  by: z.string().optional(),
  sessionId: nullish(z.string()),
  createdAt: timeSchema,
  updatedAt: nullish(timeSchema),
});
export const topicDecisionList = z.object({ decisions: z.array(topicDecision) });

export const topicSession = z.object({
  sessionId: z.string(),
  topicId: z.string(),
  by: z.string().optional(),
  at: nullish(timeSchema),
  title: nullish(z.string()),
  lastActive: nullish(timeSchema),
  node: nullish(z.string()),
  visibility: nullish(z.string()),
});
export const topicSessionList = z.object({ sessions: z.array(topicSession) });

export const filing = z.object({ sessions: z.array(topicSession) });

export const harnessList = z.object({
  harnesses: z.array(
    z.object({
      harnessId: z.string(),
      capabilities: z.object({ listSessions: z.boolean().default(false) }).default({}),
    }),
  ),
});

export const harnessSessionSummary = z.object({
  sessionId: z.string(),
  harnessId: z.string(),
  title: nullish(z.string()),
  cwd: nullish(z.string()),
  createdAt: timeSchema,
  updatedAt: timeSchema,
  status: z.enum(["active", "idle", "ended", "error"]),
  model: nullish(z.string()),
  parentSessionId: nullish(z.string()),
});
export type HarnessSessionSummary = z.infer<typeof harnessSessionSummary>;

export const harnessSessionPlaneList = z.object({ sessions: z.array(harnessSessionSummary) });

export const transcriptTool = z.object({
  name: z.string(),
  status: z.enum(["running", "done", "error"]).default("done"),
  args: nullish(z.record(z.unknown())),
  input: nullish(z.record(z.unknown())),
});

export const transcriptTurn = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().default(""),
  tools: nullish(z.array(transcriptTool)),
  startedAtMs: nullish(z.number()),
  endedAtMs: nullish(z.number()),
});
export const transcriptResponse = z.object({
  sessionId: z.string(),
  turns: z.array(transcriptTurn),
});

export const placementReply = z.object({
  placement: nullish(z.object({ sessionId: z.string(), topicId: z.string() })),
  suggestion: nullish(z.object({ name: z.string(), topicId: nullish(z.string()) })),
});

export const sessionVisibility = z.object({ sessionId: z.string(), visibility: z.string() });

export const trashList = z.object({
  candidates: z.array(
    z.object({
      session: z.string(),
      harness: z.string(),
      title: nullish(z.string()),
      updatedAt: timeSchema,
    }),
  ),
});

export const summaryNode = z.object({
  id: z.string(),
  parentId: nullish(z.string()),
  level: z.number().default(0),
  kind: z.enum(["leaf", "branch", "root"]),
  content: z.string(),
  messageCount: z.number().default(0),
  earliestAt: nullish(timeSchema),
  latestAt: nullish(timeSchema),
  createdAt: nullish(timeSchema),
});
export type SummaryWire = z.infer<typeof summaryNode>;
export const summaryDag = z.object({ sessionId: z.string(), summaries: z.array(summaryNode) });

export const memorySearch = z.object({
  results: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      source: z.string().optional(),
      content: z.string().default(""),
      createdAt: nullish(timeSchema),
      sessionId: nullish(z.string()),
      title: nullish(z.string()),
      role: nullish(z.string()),
    }),
  ),
  degraded: nullish(z.union([z.boolean(), z.string(), z.object({ reason: nullish(z.string()), effect: nullish(z.string()) })])),
  fallback: nullish(z.string()),
});

export const sessionSpan = z.object({ startedAt: timeSchema, endedAt: nullish(timeSchema) });

export const memoryBrowse = z.object({
  messages: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        role: z.string().default("assistant"),
        content: z.string().default(""),
        createdAt: nullish(timeSchema),
        sessionId: nullish(z.string()),
        agent: nullish(z.string()),
        toolName: nullish(z.string()),
      }),
    )
    .default([]),
});

export type BrowsedMessage = z.infer<typeof memoryBrowse>["messages"][number];

export const catalogRow = z.object({
  id: z.string(),
  title: z.string(),
  // A session received from someone else has no harness; it carries `origin` instead.
  harness: nullish(z.string()),
  origin: nullish(z.object({ author: nullish(z.string()), verification: nullish(z.string()) })),
  startedAt: timeSchema,
  endedAt: nullish(timeSchema),
  messageCount: z.number(),
  topic: nullish(z.object({ id: z.string(), path: z.array(z.string()) })),
  visibility: z.union([z.string(), z.object({ kind: z.literal("private") }), z.object({ kind: z.literal("space"), space: z.string() })]),
  kept: z.boolean(),
  trashed: z.boolean(),
  memoryState: z.enum(["capturing", "queued", "summarized", "flagged"]),
  gist: nullish(z.string()),
  parentId: nullish(z.string()),
  childCount: nullish(z.number()),
});
export type CatalogRow = z.infer<typeof catalogRow>;

export const catalogPage = z.object({ items: z.array(catalogRow), next: nullish(z.string()) });

export const catalogDetail = catalogRow.extend({
  cwd: nullish(z.string()),
  resumeCommand: nullish(z.string()),
  changed: z.array(z.object({ summary: z.string() })).default([]),
  entities: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
  tags: z.array(z.object({ key: z.string(), value: z.string(), state: z.enum(["applied", "suggested"]) })).default([]),
});

const entityType = z.enum(["person", "agent", "machine", "hardware", "model", "service", "software", "repository", "domain", "database"]);
const sessionMention = z.object({ id: z.string(), title: z.string() });
const factSource = z.object({ session: sessionMention, at: timeSchema, value: z.string() });
const shared = z.discriminatedUnion("kind", [z.object({ kind: z.literal("private") }), z.object({ kind: z.literal("space"), space: z.string() })]);

export const entitySummary = z.object({ id: z.string(), title: z.string(), type: entityType, sessionCount: z.number() });
export const entityList = z.array(entitySummary);

export const entityArticle = entitySummary.extend({
  aliases: z.array(z.string()),
  topic: nullish(z.object({ id: z.string(), path: z.array(z.string()) })),
  visibility: shared,
  lead: z.string(),
  facts: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      value: z.string(),
      since: timeSchema,
      pinned: z.boolean(),
      sources: z.array(factSource),
      conflict: nullish(z.object({ candidates: z.array(factSource) })),
      previous: nullish(z.object({ value: z.string(), until: timeSchema })),
    }),
  ),
  timeline: z.array(
    z.object({
      at: timeSchema,
      text: z.string(),
      kind: z.enum(["fact", "decision", "new", "filed", "conflict", "tag", "merge"]),
      source: nullish(sessionMention),
    }),
  ),
  connected: z.array(z.object({ id: z.string(), title: z.string(), sharedSessions: z.number() })),
  sessions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      harness: z.string(),
      startedAt: timeSchema,
      endedAt: nullish(timeSchema),
      messageCount: z.number(),
      topic: nullish(z.object({ id: z.string(), path: z.array(z.string()) })),
      visibility: shared,
      kept: z.boolean(),
      trashed: z.boolean(),
      memoryState: z.enum(["capturing", "queued", "summarized", "flagged"]),
      gist: nullish(z.string()),
    }),
  ),
  tags: z.array(z.object({ key: z.string(), value: z.string(), state: z.enum(["applied", "suggested"]) })),
  freshness: z.enum(["live", "sample"]),
});

export const harnessStatusList = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    found: z.boolean(),
    path: nullish(z.string()),
    version: nullish(z.string()),
    capture: z.object({
      method: z.enum(["hook", "plugin", "store-scan", "client-push"]),
      state: z.enum(["receiving", "stale", "not-connected"]),
      lastCaptureAt: nullish(timeSchema),
      detail: z.string(),
    }),
    recall: z.object({ state: z.enum(["connected", "not-connected", "elsewhere"]), detail: z.string() }),
    canConnect: z.boolean(),
  }),
);

export const connectOutcome = z.object({ diff: z.string(), backupPath: z.string() });

export const modelJobList = z.array(
  z.object({
    role: z.enum(["default", "summarizer", "categorizer", "wiki-writer", "embedder"]),
    provider: nullish(z.string()),
    model: nullish(z.string()),
    inheritsDefault: z.boolean(),
    health: z.enum(["healthy", "slow", "failing"]),
    detail: z.string(),
    queued: z.number(),
  }),
);

const subjectRef = z.object({ kind: z.enum(["topic", "entity", "session"]), id: z.string(), title: z.string() });
export type SubjectWire = z.infer<typeof subjectRef>;

export const reviewItem = z.object({
  id: z.string(),
  group: z.enum(["conflict", "fact", "filing", "tag", "tidy"]),
  subject: subjectRef,
  text: z.string(),
  before: nullish(z.string()),
  after: nullish(z.string()),
  options: nullish(z.array(z.object({ label: z.string(), value: z.string(), source: nullish(factSource) }))),
  evidence: z.array(z.object({ session: sessionMention, at: timeSchema, quote: z.string(), highlight: nullish(z.string()) })),
  createdAt: timeSchema,
});
export type ReviewWire = z.infer<typeof reviewItem>;
export const reviewList = z.array(reviewItem);

const changeActor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("you") }),
  z.object({ kind: z.literal("wiki-writer") }),
  z.object({ kind: z.literal("categorizer") }),
  z.object({ kind: z.literal("summarizer") }),
  z.object({ kind: z.literal("capture"), harness: z.string() }),
]);

export const change = z.object({
  kind: z.enum(["fact", "decision", "new", "filed", "conflict", "tag", "merge"]),
  subject: subjectRef,
  text: z.string(),
  at: timeSchema,
  actor: changeActor,
  source: nullish(z.object({ kind: z.literal("session"), id: z.string(), title: z.string() })),
});
export type ChangeWire = z.infer<typeof change>;
export const changeList = z.array(change);

export const todayDigest = z.object({
  date: z.string(),
  headline: z.string(),
  summary: z.string(),
  needsYou: z.array(reviewItem),
  reviewCount: z.number(),
  entries: z.array(z.object({ session: catalogRow, changes: z.array(change) })),
  activityByDay: z.array(z.object({ date: z.string(), level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) })),
  recentlyUpdated: z.array(subjectRef),
  freshness: z.enum(["live", "sample"]),
});

export const account = z.object({
  email: nullish(z.string()),
  updateSource: z.enum(["rivethub-cloud", "github"]),
  channel: z.enum(["stable", "beta"]),
  autoDownload: z.boolean(),
  version: z.string(),
  pendingUpdate: nullish(z.object({ version: z.string(), notesUrl: z.string() })),
  crashReports: z.boolean(),
  usageCounts: z.boolean(),
});

export const signInStarted = z.object({ requestId: z.string() });
export const signInProgress = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("signed-in"), account }),
]);

export const hubList = z.array(
  z.object({ id: z.string(), name: z.string(), kind: z.enum(["local", "team"]), url: z.string(), online: z.boolean(), detail: z.string(), current: z.boolean() }),
);
export type AccountWire = z.infer<typeof account>;
