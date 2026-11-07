import type {
  Account,
  EntityArticle,
  EntityId,
  EntitySummary,
  EntityType,
  FactId,
  HarnessId,
  HarnessStatus,
  Hub,
  IsoTime,
  ModelJob,
  ReviewDecision,
  ReviewItem,
  ReviewItemId,
  SearchResults,
  SessionDetail,
  SessionId,
  SessionSummaryRow,
  SummaryNode,
  TodayDigest,
  TopicArticle,
  TopicId,
  TopicNode,
  TranscriptTurn,
  Visibility,
} from "./domain.js";

export interface Page<T> {
  items: T[];
  next?: string;
}

export interface SessionQuery {
  text?: string;
  harness?: HarnessId;
  topic?: TopicId;
  view?: "all" | "unfiled" | "kept" | "trash";
  cursor?: string;
}

export type Capability =
  | "today"
  | "review"
  | "topics"
  | "entities"
  | "sessions"
  | "transcript"
  | "summary-tree"
  | "search"
  | "harnesses"
  | "models"
  | "hubs"
  | "account";

export interface MemoryClient {
  capabilities(): Promise<Record<Capability, "live" | "sample">>;

  today(date?: string): Promise<TodayDigest>;

  reviewQueue(): Promise<ReviewItem[]>;
  decide(id: ReviewItemId, decision: ReviewDecision): Promise<void>;

  topicTree(): Promise<TopicNode[]>;
  topic(id: TopicId): Promise<TopicArticle>;
  updateTopic(id: TopicId, patch: { name?: string; aliases?: string[]; parentId?: TopicId | null; folder?: string | null }): Promise<void>;
  addDecision(id: TopicId, text: string): Promise<void>;
  placeSession(session: SessionId, topic: TopicId | null): Promise<void>;

  entities(type?: EntityType): Promise<EntitySummary[]>;
  entity(id: EntityId, asOf?: IsoTime): Promise<EntityArticle>;
  setFact(entity: EntityId, fact: { id?: FactId; key: string; value: string; pinned: boolean }): Promise<void>;

  sessions(query: SessionQuery): Promise<Page<SessionSummaryRow>>;
  session(id: SessionId): Promise<SessionDetail>;
  transcript(id: SessionId, range?: [number, number]): Promise<TranscriptTurn[]>;
  summaryTree(id: SessionId): Promise<SummaryNode>;
  renameSession(id: SessionId, title: string): Promise<void>;
  setVisibility(id: SessionId, visibility: Visibility): Promise<void>;
  keep(id: SessionId, keep: boolean): Promise<void>;
  trash(ids: SessionId[]): Promise<void>;
  tag(id: SessionId, key: string, value: string, op: "add" | "remove" | "accept" | "reject"): Promise<void>;

  search(text: string): Promise<SearchResults>;

  harnesses(): Promise<HarnessStatus[]>;
  connectHarness(id: HarnessId, part: "capture" | "recall"): Promise<{ diff: string; backupPath: string }>;
  modelJobs(): Promise<ModelJob[]>;

  hubs(): Promise<Hub[]>;
  account(): Promise<Account>;
  updateAccount(patch: Partial<Pick<Account, "channel" | "autoDownload" | "crashReports" | "usageCounts" | "updateSource">>): Promise<void>;
}
