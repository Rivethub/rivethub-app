import type { IsoTime } from "./domain.js";

export type WorkerId = "embedder" | "summarizer" | "categorizer" | "wiki-builder";

/** How much is in memory and how well it is being kept, for the Stats screen. */
export interface MemoryStats {
  sessions: number;
  messages: number;
  toolCalls: number;
  summaries: number;
  /** Messages that can be found by meaning, and those still waiting or failed. */
  searchable: { embedded: number; waiting: number; failed: number };
  filing: { byCategorizer: number; byYou: number; notFiled: number; leftOut: number; correctionsLastWeek: number };
  wiki: { topicPages: number; entities: number; entityTypes: { name: string; count: number }[]; loosePages: number };
  workers: { id: WorkerId; lastFinishedAt?: IsoTime; failing: number }[];
  /** Proposals waiting in Review. */
  toTidy: number;
}

/** Background jobs that failed for the same reason, grouped. */
export interface FlaggedGroup {
  /** The id of one job in the group, which retry and dismiss act on. */
  id: string;
  task: string;
  cause: string;
  count: number;
  lastFailedAt: IsoTime;
}

/** The background builders an owner can pause. These are the names the hub's pause routes use. */
export type BuilderRole = "categorizer" | "wiki-builder" | "entity-builder";

export interface BuilderPause {
  role: BuilderRole;
  paused: boolean;
  /** Present only while paused. */
  pausedAt?: IsoTime;
  pausedBy?: string;
  /** Jobs waiting for this builder, whether or not it is paused. */
  queued: number;
}

export interface UpkeepClient {
  stats(): Promise<MemoryStats>;
  flagged(): Promise<FlaggedGroup[]>;
  retry(id: string): Promise<void>;
  dismiss(id: string): Promise<void>;
  /** Null when this hub cannot pause builders for this caller: no route (404, 405), a hub without Postgres (503), or not the owner (403). */
  builderPauses(): Promise<BuilderPause[] | null>;
  /** Pauses or resumes one builder and returns its state as the hub now has it. */
  setBuilderPaused(role: BuilderRole, paused: boolean): Promise<BuilderPause>;
}
