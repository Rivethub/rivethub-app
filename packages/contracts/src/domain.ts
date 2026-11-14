export type Brand<T, B extends string> = T & { readonly __brand: B };

export type SessionId = Brand<string, "SessionId">;
export type TopicId = Brand<string, "TopicId">;
export type EntityId = Brand<string, "EntityId">;
export type FactId = Brand<string, "FactId">;
export type ReviewItemId = Brand<string, "ReviewItemId">;
export type HubId = Brand<string, "HubId">;
export type IsoTime = Brand<string, "IsoTime">;

export type HarnessId = string;

export type Visibility = { kind: "private" } | { kind: "space"; space: string };

export type Freshness = "live" | "sample";

export type ChangeKind = "fact" | "decision" | "new" | "filed" | "conflict" | "tag" | "merge";

export type Actor =
  | { kind: "you" }
  | { kind: "wiki-writer" }
  | { kind: "categorizer" }
  | { kind: "summarizer" }
  | { kind: "capture"; harness: HarnessId };

export type SubjectRef =
  | { kind: "topic"; id: TopicId; title: string }
  | { kind: "entity"; id: EntityId; title: string }
  | { kind: "session"; id: SessionId; title: string };

export interface Change {
  kind: ChangeKind;
  subject: SubjectRef;
  text: string;
  at: IsoTime;
  actor: Actor;
  source?: SubjectRef & { kind: "session" };
}

export interface SessionSummaryRow {
  id: SessionId;
  title: string;
  harness: HarnessId;
  startedAt: IsoTime;
  endedAt?: IsoTime;
  messageCount: number;
  /** Set when the hub did not say how many messages the session has. `messageCount` is then 0 and means nothing. */
  messageCountUnknown?: true;
  topic?: { id: TopicId; path: string[] };
  visibility: Visibility;
  kept: boolean;
  trashed: boolean;
  memoryState: "capturing" | "queued" | "summarized" | "flagged";
  gist?: string;
  /** Set on a subagent session: the session that spawned it. */
  parentId?: SessionId;
  /** Set on a session that spawned subagents. Absent when it has none. */
  childCount?: number;
}

export type TranscriptPart =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; summary: string };

export interface TranscriptTurn {
  index: number;
  role: "user" | "assistant";
  at: IsoTime;
  parts: TranscriptPart[];
}

export interface SummaryNode {
  level: "root" | "branch" | "leaf";
  title?: string;
  text: string;
  messageRange: [number, number];
  model?: string;
  at?: IsoTime;
  children: SummaryNode[];
}

export interface SessionDetail extends SessionSummaryRow {
  cwd?: string;
  resumeCommand?: string;
  changed: Change[];
  entities: { id: EntityId; title: string }[];
  tags: TagAssignment[];
}

export interface TagAssignment {
  key: string;
  value: string;
  state: "applied" | "suggested";
}

export interface TopicNode {
  id: TopicId;
  name: string;
  parentId?: TopicId;
  sessionCount: number;
  lastActivity?: IsoTime;
  status: "open" | "closed";
  children: TopicNode[];
}

export interface Decision {
  id: string;
  text: string;
  at: IsoTime;
  superseded: boolean;
  source?: { id: SessionId; title: string };
}

export interface TopicArticle {
  id: TopicId;
  name: string;
  path: { id: TopicId; name: string }[];
  status: "open" | "closed";
  aliases: string[];
  folder?: string;
  visibility: Visibility;
  lead: string;
  /** The page's full article as the workers wrote it, in Markdown. `lead` is its first paragraph. */
  article?: string;
  current?: string;
  decisions: Decision[];
  subtopics: { id: TopicId; name: string; state: string }[];
  sessions: SessionSummaryRow[];
  sessionCount: number;
  entities: { id: EntityId; title: string }[];
  tags: TagAssignment[];
  freshness: Freshness;
}

export type EntityType =
  | "person"
  | "agent"
  | "machine"
  | "hardware"
  | "model"
  | "service"
  | "software"
  | "repository"
  | "domain"
  | "database";

export interface FactSource {
  session: { id: SessionId; title: string };
  at: IsoTime;
  value: string;
}

export interface Fact {
  id: FactId;
  key: string;
  value: string;
  since: IsoTime;
  pinned: boolean;
  sources: FactSource[];
  conflict?: { candidates: FactSource[] };
  previous?: { value: string; until: IsoTime };
}

export interface EntitySummary {
  id: EntityId;
  title: string;
  type: EntityType;
  sessionCount: number;
}

export interface EntityArticle extends EntitySummary {
  aliases: string[];
  topic?: { id: TopicId; path: string[] };
  visibility: Visibility;
  /** The page's summary: what this is, in a sentence or two. */
  lead: string;
  /** The page's full article, in Markdown. The entity worker rewrites it from every session that touches the entity. */
  article?: string;
  /** When the page's content was last checked against a session. */
  lastVerified?: IsoTime;
  facts: Fact[];
  timeline: { at: IsoTime; text: string; kind: ChangeKind; source?: { id: SessionId; title: string } }[];
  connected: { id: EntityId; title: string; sharedSessions: number }[];
  sessions: SessionSummaryRow[];
  tags: TagAssignment[];
  freshness: Freshness;
}

export interface ReviewItem {
  id: ReviewItemId;
  group: "conflict" | "fact" | "new-entity" | "filing" | "tag" | "tidy";
  subject: SubjectRef;
  text: string;
  before?: string;
  after?: string;
  options?: { label: string; value: string; source?: FactSource }[];
  evidence: { session: { id: SessionId; title: string }; at: IsoTime; quote: string; highlight?: string }[];
  createdAt: IsoTime;
}

export type ReviewDecision =
  | { kind: "accept" }
  | { kind: "reject" }
  | { kind: "later" }
  | { kind: "choose"; value: string }
  | { kind: "edit"; value: string };

export interface TodayDigest {
  date: string;
  headline: string;
  summary: string;
  needsYou: ReviewItem[];
  reviewCount: number;
  entries: { session: SessionSummaryRow; changes: Change[] }[];
  activityByDay: { date: string; level: 0 | 1 | 2 | 3 | 4 }[];
  recentlyUpdated: SubjectRef[];
  freshness: Freshness;
}

export interface SearchHit {
  subject: SubjectRef;
  snippet: string;
  context?: string;
}

/** One place the words were found: a message or a summary inside a session. */
export interface SearchPassage {
  id: string;
  session: { id: SessionId; title: string };
  source: "message" | "summary";
  text: string;
  at?: IsoTime;
  role?: "user" | "assistant" | "tool" | "system";
}

export interface SearchResults {
  goTo: SearchHit[];
  actions: { id: string; label: string; hint?: string }[];
  /** Every match, in rank order. A client that cannot list them leaves this out. */
  passages?: SearchPassage[];
  /** Set when the hub fell back to a simpler search, with the reason in plain words. */
  degraded?: string;
}

export type SearchWindow = "today" | "yesterday" | "last_7d" | "last_14d";
export type SearchScope = "messages" | "summaries";
/** `best` blends every method. The rest are for people who know what they want. */
export type SearchMode = "best" | "words" | "fuzzy" | "meaning" | "pattern";

export interface SearchOptions {
  window?: SearchWindow;
  scope?: SearchScope;
  mode?: SearchMode;
}

export type CaptureMethod = "hook" | "plugin" | "store-scan" | "client-push";

export interface HarnessStatus {
  id: HarnessId;
  name: string;
  found: boolean;
  path?: string;
  version?: string;
  capture: {
    method: CaptureMethod;
    state: "receiving" | "stale" | "not-connected";
    lastCaptureAt?: IsoTime;
    detail: string;
  };
  recall: { state: "connected" | "not-connected" | "elsewhere"; detail: string };
  canConnect: boolean;
}

export type ModelRole = "default" | "summarizer" | "categorizer" | "wiki-writer" | "embedder";

export interface ModelJob {
  role: ModelRole;
  provider?: string;
  model?: string;
  inheritsDefault: boolean;
  health: "healthy" | "slow" | "failing";
  detail: string;
  queued: number;
}

export interface Hub {
  id: HubId;
  name: string;
  kind: "local" | "team";
  url: string;
  online: boolean;
  detail: string;
  current: boolean;
}

export interface Account {
  email?: string;
  updateSource: "rivethub-cloud" | "github";
  channel: "stable" | "beta";
  autoDownload: boolean;
  version: string;
  pendingUpdate?: { version: string; notesUrl: string };
  crashReports: boolean;
  usageCounts: boolean;
}

export type SignInProgress = { status: "pending" } | { status: "signed-in"; account: Account };
