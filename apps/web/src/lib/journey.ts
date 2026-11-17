import { useCallback, useSyncExternalStore } from "react";
import { useHarnesses, useLibraryCounts, useModelJobs, usePins, useSessions } from "../client/queries";

/**
 * The path from a fresh install to someone who uses everything. Each step is
 * done when the hub's own state says so (a tool is sending sessions, a model
 * is set), or when the person did it once in this browser (a first search).
 * Nothing here is stored on the hub.
 */
export type StepId = "capture" | "first-session" | "recall" | "search" | "model" | "summary" | "review" | "pin" | "share" | "palette";

/** Steps the hub cannot see, so this browser remembers them. */
export type ManualStep = Extract<StepId, "search" | "summary" | "review" | "share" | "palette">;

export interface Stage {
  id: "capture" | "recall" | "understand" | "curate" | "share";
  title: string;
  /** What this stage gets you, in one sentence. */
  gain: string;
}

export const STAGES: Stage[] = [
  { id: "capture", title: "Capture", gain: "Everything your agents do lands in one record you own." },
  { id: "recall", title: "Recall", gain: "You and your agents can find what was said and done." },
  { id: "understand", title: "Understand", gain: "Sessions become summaries, topics and a wiki you can read." },
  { id: "curate", title: "Curate", gain: "Memory stays right because you settle what it is unsure of." },
  { id: "share", title: "Share", gain: "The right people and their agents can draw on what you learned." },
];

export interface Step {
  id: StepId;
  stage: Stage["id"];
  title: string;
  why: string;
  action: { label: string; to: string };
  done: boolean;
  /** The person set this step aside. It still counts as done. */
  dismissed: boolean;
}

const KEY = "rivethub.journey";
interface Stored {
  done: ManualStep[];
  /** Any step the person marked done, including ones the hub can also observe. */
  marked: StepId[];
  dismissed: StepId[];
  hidden: boolean;
}
const EMPTY: Stored = { done: [], marked: [], dismissed: [], hidden: false };

let cache: Stored | null = null;
const listeners = new Set<() => void>();

function read(): Stored {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Stored> | null;
    cache = {
      done: Array.isArray(raw?.done) ? raw.done : [],
      marked: Array.isArray(raw?.marked) ? raw.marked : [],
      dismissed: Array.isArray(raw?.dismissed) ? raw.dismissed : [],
      hidden: raw?.hidden === true,
    };
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: Stored) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // the guide forgets on reload, which is harmless
  }
  listeners.forEach((l) => l());
}

/** Records that the person did a step the hub cannot observe. Safe to call on every occurrence. */
export function markStep(step: ManualStep) {
  const now = read();
  if (!now.done.includes(step)) write({ ...now, done: [...now.done, step] });
}

export function setGuideHidden(hidden: boolean) {
  write({ ...read(), hidden });
}

function remember(key: "marked" | "dismissed", step: StepId) {
  const now = read();
  if (now[key].includes(step)) return;
  write({ ...now, [key]: [...now[key], step] });
}

/** Counts the step done without doing the action. Kept in this browser, with the other journey flags. */
export function markStepDone(step: StepId) {
  remember("marked", step);
}

/** Sets the step aside. It still counts toward the guide. */
export function dismissStep(step: StepId) {
  remember("dismissed", step);
}

/** For tests: forget everything this browser remembered. */
export function resetJourney() {
  cache = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to forget
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export interface Journey {
  steps: Step[];
  doneCount: number;
  /** The first step not done yet. Undefined when every step is done. */
  next: Step | undefined;
  /** The stage the next step belongs to, or the last stage when finished. */
  stage: Stage;
  finished: boolean;
  hidden: boolean;
  /** False until the hub has answered, so nothing flashes as "not done". */
  ready: boolean;
}

export function useJourney(): Journey {
  const stored = useSyncExternalStore(subscribe, read, () => EMPTY);
  const harnesses = useHarnesses();
  const jobs = useModelJobs();
  const counts = useLibraryCounts();
  const listed = useSessions({ view: "all" });
  const pins = usePins();
  const did = useCallback((s: ManualStep) => stored.done.includes(s), [stored]);
  const marked = useCallback((s: StepId) => stored.marked.includes(s), [stored]);
  const dismissed = useCallback((s: StepId) => stored.dismissed.includes(s), [stored]);
  const settled = useCallback((s: StepId) => marked(s) || dismissed(s), [marked, dismissed]);

  const sessions = counts.data?.sessions ?? listed.data?.items.length ?? 0;
  const capturing = harnesses.data?.some((h) => h.capture.state === "receiving") ?? false;
  const recalling = harnesses.data?.some((h) => h.recall.state !== "not-connected") ?? false;
  const hasModel = jobs.data?.some((j) => j.role !== "embedder" && !!j.model && j.health !== "failing") ?? false;

  const steps: Step[] = [
    { id: "capture", stage: "capture", title: "Connect a tool", why: "One hook in Claude Code, Codex or another tool sends every session here as you work.", action: { label: "Connect a tool", to: "/settings/connections" }, done: capturing || sessions > 0 || settled("capture"), dismissed: dismissed("capture") },
    { id: "first-session", stage: "capture", title: "Capture your first session", why: "Work as usual in a connected tool. The session shows up under Sessions when it ends.", action: { label: "Open Sessions", to: "/sessions" }, done: sessions > 0 || settled("first-session"), dismissed: dismissed("first-session") },
    { id: "recall", stage: "recall", title: "Let your agents recall", why: "With the recall entry connected, an agent in any tool can search this record before it answers.", action: { label: "Connect recall", to: "/settings/connections" }, done: recalling || settled("recall"), dismissed: dismissed("recall") },
    { id: "search", stage: "recall", title: "Find something yourself", why: "Search every session at once. Filters for time, messages or summaries, and exact matching are one click away.", action: { label: "Open Search", to: "/search" }, done: did("search") || settled("search"), dismissed: dismissed("search") },
    { id: "model", stage: "understand", title: "Add a model for summaries", why: "Capture and search need no model. Summaries, topics and the wiki do, and the model can run on your own machine.", action: { label: "Choose a model", to: "/settings/connections" }, done: hasModel || settled("model"), dismissed: dismissed("model") },
    { id: "summary", stage: "understand", title: "Read a session as a summary", why: "Every session gets a summary you can open level by level, down to the exact messages.", action: { label: "Open Sessions", to: "/sessions" }, done: did("summary") || settled("summary"), dismissed: dismissed("summary") },
    { id: "review", stage: "curate", title: "Settle one thing in Review", why: "When sessions disagree or a new fact turns up, memory asks you. One answer fixes it everywhere.", action: { label: "Open Review", to: "/review" }, done: did("review") || settled("review"), dismissed: dismissed("review") },
    { id: "pin", stage: "curate", title: "Pin what you come back to", why: "Pinned topics and entities stay in the sidebar on every screen.", action: { label: "Pin a topic", to: "/topics" }, done: (pins.data?.length ?? 0) > 0 || settled("pin"), dismissed: dismissed("pin") },
    { id: "share", stage: "share", title: "Share a session", why: "Mark a session for a space on this hub, or send chosen sessions to another RivetHub with secrets scrubbed first.", action: { label: "Share a session", to: "/shared" }, done: did("share") || settled("share"), dismissed: dismissed("share") },
    { id: "palette", stage: "share", title: "Jump anywhere with Ctrl K", why: "One box goes to any topic, entity or session, and runs the common actions without the mouse.", action: { label: "See the shortcuts", to: "/guide" }, done: did("palette") || settled("palette"), dismissed: dismissed("palette") },
  ];
  const next = steps.find((s) => !s.done);
  const stage = STAGES.find((s) => s.id === (next ?? steps.at(-1)!).stage)!;
  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    next,
    stage,
    finished: next === undefined,
    hidden: stored.hidden,
    ready: !harnesses.isPending && !jobs.isPending && !counts.isPending && !pins.isPending,
  };
}
