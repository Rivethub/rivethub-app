import type { ChosenSession, DraftReport, FlagChoice, FlagMark, ShareableSession, SharedBundle } from "@rivethub/contracts";
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

export type SendStep = "choose" | "decide" | "sanitizing" | "review" | "destination" | "confirm" | "sending" | "shared";

/**
 * The whole send flow. `report` holds flagged text and `sent` holds the share
 * code, so this state lives in the screen's memory only and unmounting the
 * screen is what drops them.
 */
export interface SendState {
  step: SendStep;
  picked: ShareableSession[];
  rows: Row[];
  report?: DraftReport | undefined;
  server?: string | undefined;
  signed: boolean;
  sent?: SharedBundle | undefined;
  failure?: Failure | undefined;
}

export const initialSend: SendState = { step: "choose", picked: [], rows: [], signed: true };

export type SendAction =
  | { type: "toggle"; session: ShareableSession }
  | { type: "to-decide" }
  | { type: "decide"; id: string; choice: RowChoice }
  | { type: "sanitize" }
  | { type: "drafted"; report: DraftReport }
  | { type: "resumed"; report: DraftReport }
  | { type: "report"; report: DraftReport }
  | { type: "to-destination" }
  | { type: "server"; origin: string }
  | { type: "signed"; signed: boolean }
  | { type: "to-confirm" }
  | { type: "sending" }
  | { type: "sent"; sent: SharedBundle }
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
    case "sanitize":
      return canSanitize(state.rows) ? { ...state, step: "sanitizing", failure: undefined } : state;
    case "drafted":
    case "resumed":
      return { ...state, report: action.report, step: action.type === "resumed" || action.report.flags.length > 0 ? "review" : "destination", failure: undefined };
    case "report":
      return { ...state, report: action.report };
    case "to-destination":
      return openFlags(state.report) === 0 ? { ...state, step: "destination", failure: undefined } : state;
    case "server":
      return { ...state, server: action.origin };
    case "signed":
      return { ...state, signed: action.signed };
    case "to-confirm":
      return state.server === undefined ? state : { ...state, step: "confirm", failure: undefined };
    case "sending":
      return { ...state, step: "sending", failure: undefined };
    case "sent":
      return { ...state, step: "shared", sent: action.sent, report: undefined, failure: undefined };
    case "fail":
      return { ...state, step: recoverStep(state.step, action.failure), failure: action.failure };
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

/** A failure returns to the step that can fix it. */
function recoverStep(step: SendStep, failure: Failure): SendStep {
  if (failure.backTo !== undefined) return failure.backTo;
  if (step === "sanitizing") return "decide";
  if (step === "sending") return "confirm";
  return step;
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
