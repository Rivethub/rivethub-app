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

export interface UpkeepClient {
  stats(): Promise<MemoryStats>;
  flagged(): Promise<FlaggedGroup[]>;
  retry(id: string): Promise<void>;
  dismiss(id: string): Promise<void>;
}
