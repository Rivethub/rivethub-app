import { z } from "zod";
import { descriptive, rows } from "../tolerant.js";
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
  id: z.string().min(1),
  kind: z.string().default("work"),
  type: nullish(z.string()),
  typeName: nullish(z.string()),
  slug: z.string().optional(),
  name: z.string(),
  aliases: rows(z.string()).default([]),
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

export const topicList = z.object({ topics: rows(topicSummary) });

export const createdTopic = z.object({ id: z.string() });

export const wikiPage = z.object({
  slug: z.string(),
  title: z.string(),
  currentState: z.string().default(""),
  article: nullish(z.string()),
  entities: rows(z.string()).default([]),
  tags: rows(z.string()).default([]),
  updatedAt: nullish(timeSchema),
  lastVerified: nullish(timeSchema),
});

export const topicMention = z.object({ topicId: z.string(), name: z.string() });

export const topicPage = z.object({
  topic: topicRecord,
  page: nullish(wikiPage),
  mentions: rows(topicMention).default([]),
});

export const topicDecision = z.object({
  id: z.string().min(1),
  topicId: z.string().optional(),
  text: z.string(),
  status: descriptive(["active", "superseded"]),
  by: z.string().optional(),
  sessionId: nullish(z.string()),
  createdAt: timeSchema,
  updatedAt: nullish(timeSchema),
});
export const topicDecisionList = z.object({ decisions: rows(topicDecision) });

export const topicSession = z.object({
  sessionId: z.string().min(1),
  topicId: z.string(),
  by: z.string().optional(),
  at: nullish(timeSchema),
  title: nullish(z.string()),
  lastActive: nullish(timeSchema),
  node: nullish(z.string()),
  visibility: nullish(z.string()),
});
export const topicSessionList = z.object({ sessions: rows(topicSession) });

export const filing = z.object({ sessions: rows(topicSession) });

export const harnessList = z.object({
  harnesses: rows(
    z.object({
      harnessId: z.string().min(1),
      capabilities: z.object({ listSessions: z.boolean().default(false), renameSession: z.boolean().default(false) }).default({}),
    }),
  ),
});

export const harnessSessionSummary = z.object({
  sessionId: z.string().min(1),
  harnessId: z.string().min(1),
  title: nullish(z.string()),
  cwd: nullish(z.string()),
  createdAt: timeSchema,
  updatedAt: timeSchema,
  status: descriptive(["active", "idle", "ended", "error"]),
  model: nullish(z.string()),
  parentSessionId: nullish(z.string()),
});
export type HarnessSessionSummary = z.infer<typeof harnessSessionSummary>;

export const harnessSessionPlaneList = z.object({ sessions: rows(harnessSessionSummary) });

export const transcriptTool = z.object({
  name: z.string(),
  status: descriptive(["running", "done", "error"]).default("done"),
  args: nullish(z.record(z.unknown())),
  id: nullish(z.string()),
  input: nullish(z.record(z.unknown())),
  resultText: nullish(z.string()),
});

export const toolOutput = z.object({
  text: z.string().default(""),
  isError: z.boolean().default(false),
  truncated: z.boolean().default(false),
});

export const messageUsage = z.object({
  promptTokens: z.number().default(0),
  completionTokens: z.number().default(0),
  cachedTokens: z.number().default(0),
});

// Authorship controls prompt rendering; never guess that an unknown role is the viewer.
export const transcriptTurn = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().default(""),
  replyText: nullish(z.string()),
  thinking: nullish(z.string()),
  tools: nullish(rows(transcriptTool)),
  usage: nullish(messageUsage),
  model: nullish(z.string()),
  lastBlock: nullish(z.string()),
  startedAtMs: nullish(z.number()),
  endedAtMs: nullish(z.number()),
});
export const transcriptResponse = z.object({
  sessionId: z.string().min(1),
  turns: rows(transcriptTurn),
});

export const placementReply = z.object({
  placement: nullish(z.object({ sessionId: z.string().min(1), topicId: z.string() })),
  suggestion: nullish(z.object({ name: z.string(), topicId: nullish(z.string()) })),
});

export const sessionVisibility = z.object({ sessionId: z.string().min(1), visibility: z.string() });

export const trashList = z.object({
  candidates: rows(
    z.object({
      session: z.string(),
      owner: nullish(z.string()),
      harness: z.string(),
      title: nullish(z.string()),
      updatedAt: timeSchema,
    }),
  ),
});

// Tree levels determine transcript ranges; skip unknown node shapes rather than guess a range.
export const summaryNode = z.object({
  id: z.string().min(1),
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
export const summaryDag = z.object({ sessionId: z.string().min(1), summaries: rows(summaryNode) });

export const memorySearch = z.object({
  results: rows(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      source: z.string().optional(),
      content: z.string().default(""),
      createdAt: nullish(timeSchema),
      sessionId: nullish(z.string()),
      title: nullish(z.string()),
      owner: nullish(z.string()),
      role: nullish(z.string()),
    }),
  ),
  degraded: nullish(z.union([z.boolean(), z.string(), z.object({ reason: nullish(z.string()), effect: nullish(z.string()) })])),
  fallback: nullish(z.string()),
});

export const sessionSpan = z.object({ startedAt: timeSchema, endedAt: nullish(timeSchema) });

export const memoryBrowse = z.object({
  messages: rows(
      z.object({
        id: z.union([z.string(), z.number()]).transform(String),
        role: z.string().default("assistant"),
        content: z.string().default(""),
        createdAt: nullish(timeSchema),
        sessionId: nullish(z.string()),
        owner: nullish(z.string()),
        agent: nullish(z.string()),
        toolName: nullish(z.string()),
      }),
    )
    .default([]),
});

export type BrowsedMessage = z.infer<typeof memoryBrowse>["messages"][number];

// One session's stored messages. `next` is the cursor rh issued; tool rows are included.
export const sessionMessage = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  role: z.string().default("assistant"),
  agent: nullish(z.string()),
  content: z.string().default(""),
  toolName: nullish(z.string()),
  toolArgs: nullish(z.record(z.unknown())),
  toolResult: nullish(z.string()),
  createdAt: nullish(timeSchema),
});
export const sessionMessagesPage = z.object({
  session: nullish(z.string()),
  items: rows(sessionMessage).default([]),
  total: nullish(z.number()),
  next: nullish(z.string()),
  quotedFrom: nullish(z.object({ author: nullish(z.string()), originDate: nullish(timeSchema), verification: nullish(z.string()) })),
});

export const catalogRow = z.object({
  id: z.string().min(1),
  title: z.string(),
  // A session received from someone else has no harness; it carries `origin` instead.
  owner: nullish(z.string()),
  harness: nullish(z.string()),
  origin: nullish(z.object({ author: nullish(z.string()), verification: nullish(z.string()) })),
  startedAt: timeSchema,
  endedAt: nullish(timeSchema),
  messageCount: z.number(),
  topic: nullish(z.object({ id: z.string().min(1), path: rows(z.string()) })),
  visibility: z.union([z.string(), z.object({ kind: z.literal("private") }), z.object({ kind: z.literal("space"), space: z.string() })]),
  kept: z.boolean(),
  trashed: z.boolean(),
  memoryState: descriptive(["capturing", "queued", "summarized", "flagged"]),
  gist: nullish(z.string()),
  parentId: nullish(z.string()),
  childCount: nullish(z.number()),
});
export type CatalogRow = z.infer<typeof catalogRow>;

export const catalogPage = z.object({ items: rows(catalogRow), next: nullish(z.string()) });

export const catalogDetail = catalogRow.extend({
  cwd: nullish(z.string()),
  resumeCommand: nullish(z.string()),
  nativeSessionId: nullish(z.string()),
  changed: rows(z.object({ summary: z.string() })).default([]),
  entities: rows(z.object({ id: z.string().min(1), title: z.string() })).default([]),
  tags: rows(z.object({ key: z.string(), value: z.string(), state: descriptive(["applied", "suggested"]) })).default([]),
});

const sessionMention = z.object({ id: z.string().min(1), title: z.string() });
const factSource = z.object({ session: sessionMention, at: timeSchema, value: z.string() });
const shared = z.discriminatedUnion("kind", [z.object({ kind: z.literal("private") }), z.object({ kind: z.literal("space"), space: z.string() })]);

export const entitySummary = z.object({ id: z.string().min(1), title: z.string(), type: z.string(), typeName: nullish(z.string()), sessionCount: z.number() });
export const entityList = rows(entitySummary);

export const entityTypes = rows(z.object({ type: z.string(), typeName: nullish(z.string()), count: z.number() }));
const typeTopic = topicRecord.pick({ id: true, kind: true, slug: true, name: true });
export const entityTypeTopics = z.object({
  topics: rows(z.union([z.object({ topic: typeTopic }).transform(({ topic }) => topic), typeTopic])),
});

export const entityArticle = entitySummary.extend({
  aliases: rows(z.string()),
  topic: nullish(z.object({ id: z.string().min(1), path: rows(z.string()) })),
  visibility: shared,
  lead: z.string(),
  facts: rows(
    z.object({
      id: z.string().min(1),
      key: z.string(),
      value: z.string(),
      since: timeSchema,
      pinned: z.boolean(),
      sources: rows(factSource),
      conflict: nullish(z.object({ candidates: rows(factSource) })),
      previous: nullish(z.object({ value: z.string(), until: timeSchema })),
    }),
  ),
  timeline: rows(
    z.object({
      at: timeSchema,
      text: z.string(),
      kind: descriptive(["fact", "decision", "new", "filed", "conflict", "tag", "merge", "history"]),
      source: nullish(sessionMention),
    }),
  ),
  connected: rows(z.object({ id: z.string().min(1), title: z.string(), sharedSessions: z.number() })),
  sessions: rows(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      owner: nullish(z.string()),
      harness: z.string(),
      startedAt: timeSchema,
      endedAt: nullish(timeSchema),
      messageCount: z.number(),
      topic: nullish(z.object({ id: z.string().min(1), path: rows(z.string()) })),
      visibility: shared,
      kept: z.boolean(),
      trashed: z.boolean(),
      memoryState: descriptive(["capturing", "queued", "summarized", "flagged"]),
      gist: nullish(z.string()),
    }),
  ),
  tags: rows(z.object({ key: z.string(), value: z.string(), state: descriptive(["applied", "suggested"]) })),
  freshness: descriptive(["live", "sample"]),
});

export const harnessStatusList = rows(
  z.object({
    id: z.string().min(1),
    name: z.string(),
    found: z.boolean(),
    path: nullish(z.string()),
    version: nullish(z.string()),
    capture: z.object({
      method: descriptive(["hook", "plugin", "store-scan", "client-push"]),
      state: descriptive(["receiving", "stale", "idle", "not-connected"]),
      lastCaptureAt: nullish(timeSchema),
      detail: z.string(),
    }),
    recall: z.object({ state: descriptive(["connected", "not-connected", "elsewhere"]), detail: z.string() }),
    canConnect: z.boolean(),
  }),
);

export const connectOutcome = z.object({ diff: z.string(), backupPath: z.string() });

export const modelJobList = rows(
  z.object({
    role: z.string(),
    provider: nullish(z.string()),
    model: nullish(z.string()),
    inheritsDefault: z.boolean(),
    health: descriptive(["healthy", "slow", "failing", "unconfigured", "not-running"]),
    detail: z.string(),
    queued: z.number(),
    lastRan: nullish(timeSchema),
    outage: nullish(z.string()),
  }),
);

// Navigation targets stay strict: an unknown kind must never link to the wrong resource.
const subjectRef = z.object({ type: nullish(z.string()), typeName: nullish(z.string()), kind: z.enum(["topic", "entity", "session"]), id: z.string().min(1), title: z.string() });
export type SubjectWire = z.infer<typeof subjectRef>;

export const reviewItem = z.object({
  id: z.string().min(1),
  group: descriptive(["conflict", "fact", "filing", "tag", "tidy"]),
  subject: subjectRef,
  text: z.string(),
  before: nullish(z.string()),
  after: nullish(z.string()),
  options: nullish(rows(z.object({ label: z.string(), value: z.string(), source: nullish(factSource) }))),
  evidence: rows(z.object({ session: sessionMention, at: timeSchema, quote: z.string(), highlight: nullish(z.string()) })),
  createdAt: timeSchema,
});
export type ReviewWire = z.infer<typeof reviewItem>;
export const reviewList = rows(reviewItem);

const changeActor = z.object({ kind: descriptive(["you", "wiki-writer", "categorizer", "summarizer", "capture"]), harness: z.string().optional() });

export const change = z.object({
  kind: descriptive(["fact", "decision", "new", "filed", "conflict", "tag", "merge", "history"]),
  subject: subjectRef,
  text: z.string(),
  at: timeSchema,
  actor: changeActor,
  source: nullish(z.object({ kind: z.literal("session"), id: z.string().min(1), title: z.string() })),
});
export type ChangeWire = z.infer<typeof change>;
export const changeList = rows(change);

export const todayDigest = z.object({
  date: z.string(),
  headline: z.string(),
  summary: z.string(),
  needsYou: rows(reviewItem),
  reviewCount: z.number(),
  entries: rows(z.object({ session: catalogRow, changes: rows(change) })),
  activityByDay: rows(z.object({ date: z.string(), level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) })),
  recentlyUpdated: rows(subjectRef),
  freshness: descriptive(["live", "sample"]),
});

// Update channels/sources and sign-in progression control actions, not descriptive labels.
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

export const signInStarted = z.object({ userCode: z.string(), verificationUri: z.string().url(), expiresIn: z.number().positive(), pollIntervalMs: z.number().positive() });
export const signInProgress = z.discriminatedUnion("status", [
  z.object({ status: z.literal("expired") }),
  z.object({ status: z.literal("denied") }),
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("signed-in"), account }),
]);

export const hubList = rows(
  z.object({ id: z.string().min(1), name: z.string(), kind: descriptive(["local", "team"]), url: z.string(), online: z.boolean(), detail: z.string(), current: z.boolean() }),
);
export type AccountWire = z.infer<typeof account>;

export const me = z.object({
  user: z.string(),
  spaces: z.array(z.object({ id: z.string().min(1), kind: z.string(), name: z.string() })),
  settings: z.object({ defaultVisibility: z.string(), chosen: z.boolean() }),
});
export const memoryTag = z.object({ id: z.string().min(1), key: z.string(), value: z.string(), state: z.enum(["accepted", "suggested", "rejected"]) });
export const tagLookup = z.object({ sessions: z.record(z.array(memoryTag)) });
export const tagAdded = z.object({ tag: memoryTag });
export const tagDecided = z.object({ changed: z.number().int().nonnegative() });

export const accountUrl = z.string().url();
