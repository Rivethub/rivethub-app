import type { ImportResult, InboundSession, ReceiveChoice, ReceiveDecision, ReceiveReport } from "@rivethub/contracts";
import type { Failure } from "./failure";

export type ReceiveStep = "paste" | "checking" | "report" | "importing" | "imported";

/**
 * The receive flow. `code` is a live secret: it is held here between the
 * report and the import because rh keeps no key, and it is never written to
 * the URL, history or storage. Unmounting the screen drops it.
 */
export interface ReceiveState {
  step: ReceiveStep;
  code: string;
  report?: ReceiveReport | undefined;
  choices: Record<number, ReceiveDecision | undefined>;
  result?: ImportResult | undefined;
  failure?: Failure | undefined;
}

export const initialReceive: ReceiveState = { step: "paste", code: "", choices: {} };

export type ReceiveAction =
  | { type: "code"; code: string }
  | { type: "check" }
  | { type: "report"; report: ReceiveReport }
  | { type: "choose"; n: number; decision: ReceiveDecision }
  | { type: "import" }
  | { type: "imported"; result: ImportResult }
  | { type: "fail"; failure: Failure }
  | { type: "dismiss" }
  | { type: "reset" };

export function receiveReducer(state: ReceiveState, action: ReceiveAction): ReceiveState {
  switch (action.type) {
    case "code":
      return { ...state, code: action.code, failure: undefined };
    case "check":
      return { ...state, step: "checking", failure: undefined };
    case "report":
      return { ...state, step: "report", report: action.report, choices: defaultChoices(action.report), failure: undefined };
    case "choose":
      return { ...state, choices: { ...state.choices, [action.n]: action.decision } };
    case "import":
      return canImport(state.report, state.choices) ? { ...state, step: "importing", failure: undefined } : state;
    case "imported":
      return { ...state, step: "imported", code: "", result: action.result, failure: undefined };
    case "fail":
      return { ...state, step: state.step === "checking" ? "paste" : state.step === "importing" ? "report" : state.step, failure: action.failure };
    case "dismiss":
      return { ...state, failure: undefined };
    case "reset":
      return initialReceive;
  }
}

export const isFlagged = (session: InboundSession) => session.findings > 0;

/** A clean session defaults to import. A flagged one has no default: the person must decide it. */
export function defaultChoices(report: ReceiveReport): Record<number, ReceiveDecision | undefined> {
  return Object.fromEntries(report.sessions.map((s) => [s.n, isFlagged(s) ? undefined : s.allowed.includes("import") ? "import" : undefined]));
}

/** The decisions rh accepts for a row. A secret row never offers import. */
export const decisionsFor = (session: InboundSession): ReceiveDecision[] => session.allowed;

/** A bundle whose sender details carry a finding is refused by rh, so there is nothing to decide. */
export const blocked = (report: ReceiveReport | undefined) => (report?.authorFindings ?? 0) > 0;

export function undecided(report: ReceiveReport | undefined, choices: ReceiveState["choices"]): InboundSession[] {
  return report?.sessions.filter((s) => isFlagged(s) && choices[s.n] === undefined) ?? [];
}

/** Every flagged session has a decision, and something would actually be imported. */
export function canImport(report: ReceiveReport | undefined, choices: ReceiveState["choices"]): boolean {
  if (!report || blocked(report) || undecided(report, choices).length > 0) return false;
  return report.sessions.some((s) => choices[s.n] === "import" || choices[s.n] === "hold_spans");
}

export function importChoices(report: ReceiveReport, choices: ReceiveState["choices"]): ReceiveChoice[] {
  return report.sessions.flatMap((s): ReceiveChoice[] => {
    const decision = choices[s.n];
    return decision === undefined ? [] : [{ n: s.n, decision }];
  });
}

/** Accepting a flagged session as is needs a fresh sign-in; rh enforces it and the screen warns first. */
export const acceptsFlagged = (report: ReceiveReport, choices: ReceiveState["choices"]) =>
  report.sessions.some((s) => isFlagged(s) && choices[s.n] === "import");

export const verifiedLabel = (verification: ReceiveReport["verification"]) => (verification === "verified" ? "verified" : verification === "unsigned" || verification === "unknown_key" ? "unverified" : verification);
