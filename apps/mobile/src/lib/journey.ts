import type { SettingsSection } from "../nav/types";

/**
 * The path from a fresh install to someone who uses everything. Each step is
 * done when the hub's own state says so, or when the person did it once on
 * this phone. Nothing here is stored on the hub. The desktop "Ctrl K" step
 * is left out: the phone has no keyboard shortcut for it.
 */
export type StepId = "capture" | "first-session" | "recall" | "search" | "model" | "summary" | "review" | "pin" | "share";

export type ManualStep = Extract<StepId, "search" | "summary" | "review" | "share">;

export interface Stage {
  id: "capture" | "recall" | "understand" | "curate" | "share";
  title: string;
  gain: string;
}

export const STAGES: Stage[] = [
  { id: "capture", title: "Capture", gain: "Everything your agents do lands in one record you own." },
  { id: "recall", title: "Recall", gain: "You and your agents can find what was said and done." },
  { id: "understand", title: "Understand", gain: "Sessions become summaries, topics and a wiki you can read." },
  { id: "curate", title: "Curate", gain: "Memory stays right because you settle what it is unsure of." },
  { id: "share", title: "Share", gain: "The right people and their agents can draw on what you learned." },
];

export type StepLink =
  | { screen: "Settings"; section: SettingsSection }
  | { screen: "Library"; segment: "sessions" | "topics" }
  | { screen: "Search" }
  | { screen: "Review" }
  | { screen: "Shared" };

export interface Step {
  id: StepId;
  stage: Stage["id"];
  title: string;
  why: string;
  action: { label: string; to: StepLink };
  done: boolean;
}

export interface JourneyFacts {
  sessions: number;
  capturing: boolean;
  recalling: boolean;
  hasModel: boolean;
  pins: number;
  done: readonly ManualStep[];
}

export interface BuiltJourney {
  steps: Step[];
  doneCount: number;
  next: Step | undefined;
  stage: Stage;
  finished: boolean;
}

export function buildJourney(facts: JourneyFacts): BuiltJourney {
  const did = (step: ManualStep) => facts.done.includes(step);
  const steps: Step[] = [
    { id: "capture", stage: "capture", title: "Connect a tool", why: "One hook in Claude Code, Codex or another tool sends every session here as you work.", action: { label: "Connect a tool", to: { screen: "Settings", section: "connections" } }, done: facts.capturing || facts.sessions > 0 },
    { id: "first-session", stage: "capture", title: "Capture your first session", why: "Work as usual in a connected tool. The session shows up under Sessions when it ends.", action: { label: "Open Sessions", to: { screen: "Library", segment: "sessions" } }, done: facts.sessions > 0 },
    { id: "recall", stage: "recall", title: "Let your agents recall", why: "With the recall entry connected, an agent in any tool can search this record before it answers.", action: { label: "Connect recall", to: { screen: "Settings", section: "connections" } }, done: facts.recalling },
    { id: "search", stage: "recall", title: "Find something yourself", why: "Search every session at once. Filters for time, messages or summaries, and exact matching are one tap away.", action: { label: "Open Search", to: { screen: "Search" } }, done: did("search") },
    { id: "model", stage: "understand", title: "Add a model for summaries", why: "Capture and search need no model. Summaries, topics and the wiki do, and the model can run on your own machine.", action: { label: "Choose a model", to: { screen: "Settings", section: "connections" } }, done: facts.hasModel },
    { id: "summary", stage: "understand", title: "Read a session as a summary", why: "Every session gets a summary you can open level by level, down to the exact messages.", action: { label: "Open Sessions", to: { screen: "Library", segment: "sessions" } }, done: did("summary") },
    { id: "review", stage: "curate", title: "Settle one thing in Review", why: "When sessions disagree or a new fact turns up, memory asks you. One answer fixes it everywhere.", action: { label: "Open Review", to: { screen: "Review" } }, done: did("review") },
    { id: "pin", stage: "curate", title: "Pin what you come back to", why: "Pinned topics and entities stay at the top of Topics on this phone.", action: { label: "Browse topics", to: { screen: "Library", segment: "topics" } }, done: facts.pins > 0 },
    { id: "share", stage: "share", title: "Share a session", why: "Mark a session for a space on this hub, or send chosen sessions to another RivetHub with secrets scrubbed first.", action: { label: "See how sharing works", to: { screen: "Shared" } }, done: did("share") },
  ];
  const next = steps.find((step) => !step.done);
  const stage = STAGES.find((item) => item.id === (next ?? steps.at(-1)!).stage)!;
  return { steps, doneCount: steps.filter((step) => step.done).length, next, stage, finished: next === undefined };
}
