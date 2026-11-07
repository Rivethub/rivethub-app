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

export const wikiPage = z.object({
  slug: z.string(),
  title: z.string(),
  currentState: z.string().default(""),
  article: nullish(z.string()),
  entities: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  updatedAt: nullish(timeSchema),
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
    }),
  ),
});
