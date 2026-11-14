import type { IsoTime } from "./domain.js";

/**
 * Sharing sessions from this machine and receiving them, over rh's local
 * `/api/share/**` routes (rivethub-runtime CONTRACT notes 151 and 152).
 * Local owner only, so only the desktop app uses it.
 */

/** A session as the share search ranks it. `id` is the stored session's UUID. */
export interface ShareableSession {
  id: string;
  title?: string;
  agent: string;
  first: IsoTime;
  last: IsoTime;
  messages: number;
  excerpts: string[];
  importedFrom?: string;
}

export interface ShareSearch {
  text: string;
  limit?: number;
}

/** A denied session is never in a draft, so the sender has only these two. */
export type ShareDecision = { kind: "approve" } | { kind: "redact"; terms: string[]; dropToolOutputs: boolean };

export interface ChosenSession {
  id: string;
  decision: ShareDecision;
}

export type FlagState = { kind: "open" } | { kind: "keep" } | { kind: "redact" } | { kind: "map"; term: string; placeholder: string };
export type FlagChoice = Exclude<FlagState, { kind: "open" }>;

export interface FlagPlace {
  /** 0-based, in the draft's session order. */
  session: number;
  message?: number;
  field: string;
  more: number;
}

export interface DraftFlag {
  number: number;
  score: number;
  session?: string;
  place?: FlagPlace;
  length: number;
  /** The flagged span with hidden and bidi characters written as `<U+XXXX>`. Only the local owner receives it. */
  text: string;
  state: FlagState;
}

export interface DraftReport {
  draft: string;
  expiresAt: IsoTime;
  totals: { secrets: number; mapped: number; redacted: number; escaped: number; rechecked: number };
  rules: { rule: string; count: number }[];
  sessions: { id: string; agent: string; messages: number }[];
  notScanned: string;
  bestEffort: string;
  flags: DraftFlag[];
}

export interface FlagMark {
  number: number;
  choice: FlagChoice;
  /** Remember a mapping for later drafts. */
  learn?: boolean;
}

export interface MarksResult {
  report: DraftReport;
  rechecked: string[];
  learned?: string;
}

export type ShareServerKind = "cloud" | "team" | (string & {});

export interface ShareServer {
  origin: string;
  kind: ShareServerKind;
  user?: string;
  signedIn: boolean;
  default: boolean;
}

export interface ShareServers {
  servers: ShareServer[];
  /** `keyring` or `file`: where this rh keeps share tokens. */
  tokenStore: "keyring" | "file" | (string & {});
}

export type ShareLoginRequest = { kind: "cloud"; origin: string } | { kind: "team"; origin: string; token: string };

export type ShareLoginStep =
  | { state: "started"; login: string; userCode: string; verificationUrl: string; interval: number; expiresAt: IsoTime }
  | { state: "pending"; interval: number }
  | { state: "signed-in"; origin: string; user?: string };

export interface ShareSend {
  server: string;
  signed: boolean;
  /** The counts the sender saw. rh refuses to send when they differ from the draft's. */
  confirm: { sessions: number; keptFlags: number };
}

/** The share code is a live secret: hold it in memory only and show it once. */
export interface SharedBundle {
  code: string;
  expiresAt: IsoTime;
  bytes: number;
  /** The fingerprint the bundle was signed as, when it was signed. */
  signed?: string;
}

export interface ShareKey {
  key: string;
  fingerprint: string;
}

export type ShareVerification = "verified" | "unsigned" | "unknown_key" | (string & {});
export type ReceiveDecision = "import" | "skip" | "hold_spans";

export interface FindingRow {
  event?: string;
  field: string;
  rule: string;
  family: "secret" | "injection" | (string & {});
  kind: string;
  count: number;
  /** An excerpt with the finding between `>>` and `<<` and hidden characters written as `<U+XXXX>`. */
  excerpt: string;
}

export interface InboundSession {
  /** 1-based; names the session in the import request. */
  n: number;
  author?: string;
  title: string;
  agent: string;
  messages: number;
  createdAt?: IsoTime;
  updatedAt?: IsoTime;
  findings: number;
  rows: FindingRow[];
  secret: boolean;
  /** The decisions rh accepts for this session. */
  allowed: ReceiveDecision[];
}

export interface SenderKey {
  key: string;
  fingerprint: string;
}

export interface ReceiveReport {
  bundle: string;
  server: string;
  downloaded: boolean;
  author: string;
  node: string;
  verification: ShareVerification;
  reason: string;
  signer?: SenderKey;
  sessions: InboundSession[];
  authorFindings: number;
  authorRows: FindingRow[];
  summary: string;
  held: boolean;
}

export interface ReceiveChoice {
  n: number;
  decision: ReceiveDecision;
}

export interface ReceiveImport {
  choices: ReceiveChoice[];
  /** Imports secret findings and author-field findings too. Off unless the person asks. */
  force?: boolean;
}

export interface ImportedSession {
  n: number;
  /** The stored session's key, which its Memory page uses as its id. */
  key: string;
  verification: ShareVerification;
  verdict: "clean" | "import" | "hold_spans";
  inserted: number;
  skipped: number;
}

export interface ImportResult {
  bundle: string;
  receivedAt: IsoTime;
  author: string;
  verification: ShareVerification;
  signer?: SenderKey;
  imported: ImportedSession[];
  skipped: number[];
}

export interface TrustedSender {
  name: string;
  key: string;
  fingerprint: string;
}

/**
 * Every call goes to the local rh with the person's own credentials. Failures
 * are `HttpError` with `code` set to rh's `reason`, `RouteMissingError` when
 * rh predates these routes, and `ReauthRequiredError` when the step-up
 * window has passed.
 */
export interface ShareClient {
  find(search: ShareSearch): Promise<ShareableSession[]>;

  /**
   * Sanitizes the chosen sessions in rh's memory. Nothing is written to disk.
   * With `decide`, the configured decision model also flags what it finds suspicious; without it the draft has no flags.
   */
  createDraft(sessions: ChosenSession[], options?: { decide?: boolean }): Promise<DraftReport>;
  draft(id: string): Promise<DraftReport>;
  mark(id: string, marks: FlagMark[]): Promise<MarksResult>;
  discard(id: string): Promise<void>;
  /** Seals the draft and uploads it. Needs a fresh login. */
  send(id: string, request: ShareSend): Promise<SharedBundle>;

  servers(): Promise<ShareServers>;
  /** Needs a fresh login. */
  login(request: ShareLoginRequest): Promise<ShareLoginStep>;
  pollLogin(login: string): Promise<ShareLoginStep>;
  logout(origin: string): Promise<void>;
  key(): Promise<ShareKey>;

  /** Downloads and opens the bundle and runs rh's checks. Imports nothing. */
  receive(code: string): Promise<ReceiveReport>;
  /** Imports what the person decided. Accepting flagged content needs a fresh login. */
  importReceived(code: string, request: ReceiveImport): Promise<ImportResult>;
  trusted(): Promise<TrustedSender[]>;
  /** Needs a fresh login. */
  trust(name: string, key: string): Promise<void>;
  untrust(name: string, key?: string): Promise<number>;
}
