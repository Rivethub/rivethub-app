import type { ChosenSession, DraftReport, FlagChoice, FlagMark, PushedBundle, ShareableSession, SharedBundle, ShareServer } from "@rivethub/contracts";
import type { Failure } from "./failure";

/** What the sender decided for one session. Deny keeps the row but never reaches rh. */
export type RowChoice =
  | { kind: "undecided" }
  | { kind: "approve" }
  | { kind: "deny" }
  | { kind: "redact"; terms: string[]; dropToolOutputs: boolean };

export interface Row {
  session: ShareableSession;
  choice: RowChoice;
}

/** `opening` turns a ready bundle into a draft; it skips deciding, because the bundle was sanitized when it was exported. */
export type SendStep = "choose" | "opening" | "decide" | "sanitizing" | "review" | "destination" | "confirm" | "sending" | "shared";

/** What the sender got back: a share code to pass on, or sessions already in a team hub. */
export type Delivery = { kind: "code"; sent: SharedBundle } | { kind: "pushed"; pushed: PushedBundle };

/**
 * The whole send flow. `report` holds flagged text and `delivered` can hold the share
 * code, so this state lives in the screen's memory only and unmounting the
 * screen is what drops them.
 */
export interface SendState {
  step: SendStep;
  picked: ShareableSession[];
  rows: Row[];
  /** Ask the decision model to flag what it finds suspicious. On unless rh has none configured. */
  decide: boolean;
  report?: DraftReport | undefined;
  /** The ready bundle the draft was opened from. rh reports no scan totals for such a draft: the bundle was scanned when it was exported. */
  bundle?: string | undefined;
  /** What rh said after flag choices were applied. It belongs to this draft only. */
  notice?: string | undefined;
  server?: ShareServer | undefined;
  signed: boolean;
  delivered?: Delivery | undefined;
  failure?: Failure | undefined;
}

export const initialSend: SendState = { step: "choose", picked: [], rows: [], decide: true, signed: true };

export type SendAction =
  | { type: "toggle"; session: ShareableSession }
  | { type: "to-decide" }
  | { type: "decide"; id: string; choice: RowChoice }
  | { type: "decide-model"; on: boolean }
  | { type: "sanitize" }
  | { type: "open-bundle" }
  | { type: "drafted"; report: DraftReport; bundle?: string | undefined }
  | { type: "resumed"; report: DraftReport; bundle?: string | undefined }
  | { type: "report"; report: DraftReport; notice?: string | undefined }
  | { type: "to-destination" }
  | { type: "server"; server: ShareServer }
  | { type: "signed"; signed: boolean }
  | { type: "to-confirm" }
  | { type: "sending" }
  | { type: "delivered"; delivery: Delivery }
  | { type: "fail"; failure: Failure }
  | { type: "dismiss" }
  | { type: "back" }
  | { type: "reset" };

const BACK: Partial<Record<SendStep, SendStep>> = { decide: "choose", destination: "review", confirm: "destination" };

export function sendReducer(state: SendState, action: SendAction): SendState {
  switch (action.type) {
    case "toggle": {
      const has = state.picked.some((s) => s.id === action.session.id);
      return { ...state, picked: has ? state.picked.filter((s) => s.id !== action.session.id) : [...state.picked, action.session] };
    }
    case "to-decide": {
      if (state.picked.length === 0) return state;
      const rows = state.picked.map((session): Row => state.rows.find((r) => r.session.id === session.id) ?? { session, choice: { kind: "undecided" } });
      return { ...state, step: "decide", rows, failure: undefined };
    }
    case "decide":
      return { ...state, rows: state.rows.map((r) => (r.session.id === action.id ? { ...r, choice: action.choice } : r)) };
    case "decide-model":
      return { ...state, decide: action.on };
    case "sanitize":
      return canSanitize(state.rows) ? { ...state, step: "sanitizing", failure: undefined } : state;
    case "open-bundle":
      return state.step === "choose" ? { ...state, step: "opening", rows: [], failure: undefined } : state;
    case "drafted":
    case "resumed":
      return {
        ...state,
        report: action.report,
        bundle: action.bundle,
        notice: undefined,
        step: action.type === "resumed" || action.report.flags.length > 0 ? "review" : "destination",
        failure: undefined,
      };
    case "report":
      return { ...state, report: action.report, notice: action.notice };
    case "to-destination":
      return openFlags(state.report) === 0 ? { ...state, step: "destination", failure: undefined } : state;
    case "server":
      return { ...state, server: action.server };
    case "signed":
      return { ...state, signed: action.signed };
    case "to-confirm":
      return state.server === undefined ? state : { ...state, step: "confirm", failure: undefined };
    case "sending":
      return { ...state, step: "sending", failure: undefined };
    case "delivered":
      return { ...state, step: "shared", delivered: action.delivery, report: undefined, bundle: undefined, notice: undefined, failure: undefined };
    case "fail":
      return { ...state, step: recoverStep(state, action.failure), failure: action.failure, decide: action.failure.code === "decide_unconfigured" ? false : state.decide };
    case "dismiss":
      return { ...state, failure: undefined };
    case "reset":
      return initialSend;
    case "back": {
      const to = BACK[state.step];
      return to === undefined ? state : { ...state, step: to, failure: undefined };
    }
  }
}

const RECOVER: Partial<Record<SendStep, SendStep>> = { sanitizing: "decide", opening: "choose", sending: "confirm" };

/** A failure returns to the step that can fix it. A draft opened from a bundle has no rows to decide, so it goes back to choosing. */
function recoverStep(state: SendState, failure: Failure): SendStep {
  const to = failure.backTo ?? RECOVER[state.step] ?? state.step;
  return to === "decide" && state.rows.length === 0 ? "choose" : to;
}

export const isDecided = (row: Row) => row.choice.kind !== "undecided";

/** Continue needs every row decided and at least one session that will actually be sent. */
export function canSanitize(rows: Row[]): boolean {
  return rows.length > 0 && rows.every(isDecided) && rows.some((r) => r.choice.kind !== "deny");
}

/** What goes to rh: denied sessions are left out. */
export function chosenSessions(rows: Row[]): ChosenSession[] {
  return rows.flatMap(({ session, choice }): ChosenSession[] => {
    switch (choice.kind) {
      case "approve":
        return [{ id: session.id, decision: { kind: "approve" } }];
      case "redact":
        return [{ id: session.id, decision: { kind: "redact", terms: choice.terms, dropToolOutputs: choice.dropToolOutputs } }];
      case "deny":
      case "undecided":
        return [];
    }
  });
}

export function tally(rows: Row[]): { approved: number; redacted: number; denied: number; undecided: number } {
  const count = (kind: RowChoice["kind"]) => rows.filter((r) => r.choice.kind === kind).length;
  return { approved: count("approve"), redacted: count("redact"), denied: count("deny"), undecided: count("undecided") };
}

/** A term is exact and case-sensitive. Blank and repeated terms are refused with a reason. */
export function termProblem(terms: string[], term: string): string | null {
  if (term.trim() === "") return "Type a term to redact.";
  if (terms.includes(term.trim())) return "That term is already listed.";
  return null;
}

export const openFlags = (report: DraftReport | undefined) => report?.flags.filter((f) => f.state.kind === "open").length ?? 0;
export const keptFlags = (report: DraftReport | undefined) => report?.flags.filter((f) => f.state.kind === "keep").length ?? 0;

/** The counts the sender confirms. rh refuses the send when they differ from the draft's. */
export function confirmCounts(report: DraftReport): { sessions: number; keptFlags: number } {
  return { sessions: report.sessions.length, keptFlags: keptFlags(report) };
}

/** What the sender picked for one flag, before it is applied. */
export interface FlagPick {
  choice: FlagChoice;
  learn?: boolean;
}

/** Marks for the flags the sender changed since rh last reported. */
export function pendingMarks(report: DraftReport, picks: Record<number, FlagPick | undefined>): FlagMark[] {
  return report.flags.flatMap((flag): FlagMark[] => {
    const pick = picks[flag.number];
    if (pick === undefined || sameChoice(flag.state, pick.choice)) return [];
    return [{ number: flag.number, choice: pick.choice, ...(pick.learn ? { learn: true } : {}) }];
  });
}

function sameChoice(state: DraftReport["flags"][number]["state"], choice: FlagChoice): boolean {
  if (state.kind !== choice.kind) return false;
  return state.kind !== "map" || (choice.kind === "map" && state.term === choice.term && state.placeholder === choice.placeholder);
}
