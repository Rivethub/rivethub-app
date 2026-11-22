import { count, dayLabel, shortDate, time } from "@rivethub/client-runtime/format";
import type { BuilderPause, BuilderRole } from "@rivethub/contracts";

export const BUILDER_NAME: Record<BuilderRole, string> = {
  categorizer: "Filing",
  "wiki-builder": "Wiki builder",
  "entity-builder": "Entity builder",
};

export const BUILDER_HINT: Record<BuilderRole, string> = {
  categorizer: "Files sessions into topics.",
  "wiki-builder": "Writes and updates topic pages.",
  "entity-builder": "Writes entity pages and their facts.",
};

export const waiting = (queued: number) => `${count(queued)} ${queued === 1 ? "job" : "jobs"} waiting`;

function since(iso: string, now: Date): string {
  return dayLabel(iso, now) === "Today" ? `${time(iso)} today` : `${shortDate(iso)}, ${time(iso)}`;
}

/** "Running · 12 jobs waiting" or "Paused since 14:02 today · 4,210 jobs waiting". */
export function builderStatus(pause: BuilderPause, now = new Date()): string {
  const state = !pause.paused ? "Running" : pause.pausedAt ? `Paused since ${since(pause.pausedAt, now)}` : "Paused";
  return pause.queued > 0 ? `${state} · ${waiting(pause.queued)}` : state;
}
