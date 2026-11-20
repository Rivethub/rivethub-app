import type {
  Account,
  Change,
  EntityArticle,
  EntityCategory,
  EntityId,
  EntitySummary,
  EntityType,
  FactId,
  HarnessId,
  HarnessStatus,
  Hub,
  IsoTime,
  Me,
  ModelJob,
  ReviewDecision,
  ReviewItem,
  ReviewItemId,
  SearchOptions,
  SearchResults,
  SessionDetail,
  SessionId,
  SessionSummaryRow,
  SignInProgress,
  SignInStarted,
  SummaryNode,
  TodayDigest,
  TopicArticle,
  TopicId,
  TopicNode,
  ToolOutput,
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

/** `subject` is a topic, entity or session id. `from` and `to` bound the change time. */
export interface ChangeQuery {
  subject?: TopicId | EntityId | SessionId;
  from?: IsoTime;
  to?: IsoTime;
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
  /** Newest first. Backs the History tabs. */
  changes(query: ChangeQuery): Promise<Change[]>;

  topicTree(): Promise<TopicNode[]>;
  topic(id: TopicId): Promise<TopicArticle>;
  updateTopic(id: TopicId, patch: { name?: string; aliases?: string[]; parentId?: TopicId | null; folder?: string | null }): Promise<void>;
  /** Creates a topic by hand, at the top level or inside `parentId`. Absent on a client that cannot write topics. */
  createTopic?(name: string, parentId?: TopicId): Promise<TopicId>;
  addDecision(id: TopicId, text: string): Promise<void>;
  placeSession(session: SessionId, topic: TopicId | null): Promise<void>;

  entities(type?: EntityType): Promise<EntitySummary[]>;
  entity(id: EntityId, asOf?: IsoTime): Promise<EntityArticle>;
  /** Includes empty categories. Null means this hub's category routes are unavailable. */
  entityTypes?(): Promise<EntityCategory[] | null>;
  createEntityCategory?(name: string): Promise<TopicId>;
  createEntity?(name: string, categoryId: TopicId): Promise<EntityId>;
  moveEntity?(id: EntityId, categoryId: TopicId): Promise<void>;
  setFact(entity: EntityId, fact: { id?: FactId; key: string; value: string; pinned: boolean }): Promise<void>;

  sessions(query: SessionQuery): Promise<Page<SessionSummaryRow>>;
  session(id: SessionId): Promise<SessionDetail>;
  transcript(id: SessionId, range?: [number, number]): Promise<TranscriptTurn[]>;
  /** One tool call's output. Only the machine that ran the session has it. */
  toolOutput(id: SessionId, tool: string): Promise<ToolOutput>;
  summaryTree(id: SessionId): Promise<SummaryNode>;
  renameSession(id: SessionId, title: string): Promise<void>;
  setVisibility(id: SessionId, visibility: Visibility): Promise<void>;
  keep(id: SessionId, keep: boolean): Promise<void>;
  /** Moves sessions to the trash. Reversible with `restore`; nothing is deleted for good. */
  trash(ids: SessionId[]): Promise<void>;
  restore(ids: SessionId[]): Promise<void>;
  tag(id: SessionId, key: string, value: string, op: "add" | "remove" | "accept" | "reject"): Promise<void>;

  /** `options` narrows where and how to look. A client may ignore options it cannot honor. */
  search(text: string, options?: SearchOptions): Promise<SearchResults>;

  harnesses(): Promise<HarnessStatus[]>;
  /** With `dryRun` nothing is written: the diff is what connecting would change, and `backupPath` is empty. */
  connectHarness(id: HarnessId, part: "capture" | "recall", options?: { dryRun?: boolean }): Promise<{ diff: string; backupPath: string }>;
  modelJobs(): Promise<ModelJob[]>;

  hubs(): Promise<Hub[]>;
  /** Operations backed by this client. Absence means no tag controls. */
  tagOperations?(): Promise<("add" | "accept" | "reject" | "remove")[]>;
  account(): Promise<Account>;
  /** Membership and sharing defaults from this hub, independent of cloud account settings. */
  me(): Promise<Me>;
  updateAccount(patch: Partial<Pick<Account, "channel" | "autoDownload" | "crashReports" | "usageCounts" | "updateSource">>): Promise<void>;
  /** Starts device approval. The node polls the cloud; no email or secret leaves the node. */
  signIn(): Promise<SignInStarted>;
  pollSignIn(): Promise<SignInProgress>;
  signOut(): Promise<Account>;
  /** Deletes the RivetHub account, not any memory. */
  deleteAccount(): Promise<Account & { accountUrl?: string }>;
}
