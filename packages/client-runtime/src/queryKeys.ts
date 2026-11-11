import type { EntityId, EntityType, IsoTime, SessionId, SessionQuery, TopicId } from "@rivethub/contracts";

type QueryKey = readonly unknown[];

export const keys = {
  capabilities: ["capabilities"],
  today: (date?: string) => ["today", date ?? "now"],
  review: ["review"],
  topicTree: ["topics"],
  topic: (id: TopicId) => ["topic", id],
  changes: (subject: TopicId | EntityId) => ["changes", subject],
  entities: (type?: EntityType) => ["entities", type ?? "all"],
  entity: (id: EntityId, asOf?: IsoTime) => ["entity", id, asOf ?? "now"],
  sessions: (q: SessionQuery) => ["sessions", q],
  session: (id: SessionId) => ["session", id],
  transcript: (id: SessionId) => ["session", id, "transcript"],
  summaryTree: (id: SessionId) => ["session", id, "summary"],
  search: (text: string) => ["search", text],
  harnesses: ["harnesses"],
  modelJobs: ["modelJobs"],
  hubs: ["hubs"],
  account: ["account"],
  pins: ["pins"],
  counts: ["counts"],
  crash: ["crash"],
} satisfies Record<string, QueryKey | ((...a: never[]) => QueryKey)>;

/** Every query a write to memory (a review decision, a move, a trash) can change. */
export const memoryWideKeys: QueryKey[] = [["today"], ["changes"], keys.review, ["topic"], ["entity"], ["session"], ["sessions"], keys.topicTree, keys.counts];
