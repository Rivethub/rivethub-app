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

export type Freshness = "live" | "sample" | (string & {});

export type ChangeKind = "fact" | "decision" | "new" | "filed" | "conflict" | "tag" | "merge" | "history" | (string & {});

export type Actor =
  | { kind: "you" }
  | { kind: "wiki-writer" }
  | { kind: "categorizer" }
  | { kind: "summarizer" }
  | { kind: "capture"; harness: HarnessId };

export type SubjectRef =
  | { kind: "topic"; id: TopicId; title: string }
  | { kind: "entity"; id: EntityId; title: string; type?: string; typeName?: string }
  | { kind: "session"; id: SessionId; title: string };

export interface Change {
  kind: ChangeKind;
  subject: SubjectRef;
  text: string;
  at: IsoTime;
  actor: Actor;
  source?: SubjectRef & { kind: "session" };
}

/** Where a session someone shared with this hub came from. */
export interface SessionOrigin {
  author?: string;
  /** Whether the bundle was signed by a key this hub trusts. */
  verification?: "verified" | "unsigned" | "unknown_key" | (string & {});
}

export interface SessionSummaryRow {
  /** Present only when the session belongs to a teammate. */
  owner?: string;
  id: SessionId;
  title: string;
  /** The tool the session ran in. `shared` for a session received from someone else, which no tool on this hub ran. */
  harness: HarnessId;
  /** Set on a session received from someone else. Absent on sessions captured here. */
  origin?: SessionOrigin;
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
  /** Raw label when the hub sends a state this app does not interpret. */
  memoryStateRaw?: string;
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
  /**
   * Set on the first or last turn when the hub could not hand over the messages before it or after it,
   * so a transcript that is not whole never reads as one that is.
   */
  missing?: "before" | "after";
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
  state: "applied" | "suggested" | (string & {});
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

export type EntityType = string;

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
  /** Display name supplied by the hub, used as given without pluralization. */
  typeName?: string;
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
  /** Unknown review groups are display-only; never infer an accept action. */
  rawGroup?: string;
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
  owner?: string;
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

export type CaptureMethod = "hook" | "plugin" | "store-scan" | "client-push" | (string & {});

export interface HarnessStatus {
  capabilities?: { renameSession: boolean };
  id: HarnessId;
  name: string;
  found: boolean;
  path?: string;
  version?: string;
  capture: {
    method: CaptureMethod;
    /** `idle`: set up, and nothing has been captured from it yet. `stale`: it sent sessions before and has stopped. */
    state: "receiving" | "stale" | "idle" | "not-connected" | (string & {});
    lastCaptureAt?: IsoTime;
    detail: string;
  };
  recall: { state: "connected" | "not-connected" | "elsewhere" | (string & {}); detail: string };
  canConnect: boolean;
}

export type ModelRole = string;

export interface ModelJob {
  role: ModelRole;
  provider?: string;
  model?: string;
  inheritsDefault: boolean;
  health: "healthy" | "slow" | "failing" | (string & {});
  detail: string;
  queued: number;
}

export interface Hub {
  id: HubId;
  name: string;
  kind: "local" | "team" | (string & {});
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

/** A space the signed-in person belongs to, as `/api/me` names it. */
export interface SpaceMembership {
  id: string;
  kind: string;
  name: string;
}

export interface Me {
  user: string;
  spaces: SpaceMembership[];
  settings: { defaultVisibility: string; chosen: boolean };
}

export type SignInProgress = { status: "pending" } | { status: "signed-in"; account: Account };
