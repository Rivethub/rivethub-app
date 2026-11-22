import type { BuilderPause, BuilderRole, FlaggedGroup, IsoTime, MemoryStats, UpkeepClient, WorkerId } from "@rivethub/contracts";
import { z } from "zod";
import { HttpError, RouteMissingError } from "../errors.js";
import { rows } from "../tolerant.js";
import { createHttp, type AuthSeam, type FetchLike } from "../http.js";
import { timeSchema } from "../rh/wire.js";

export interface UpkeepClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  auth?: AuthSeam;
}

const count = z.number().default(0);
const activity = z.object({ lastFinishedAt: timeSchema.nullish(), failing: count }).prefault({ failing: 0 });

const statsWire = z.object({
  conversations: count,
  messages: count,
  toolCalls: count,
  summaries: count,
  embedQueueDepth: count,
  embeddedMessages: count,
  failedEmbeddings: count,
});

const upkeepWire = z.object({
  filing: z.object({ categorizer: count, you: count, uncategorized: count, leftOut: count, correctionsLastWeek: count }),
  wiki: z.object({ topicPages: count, entityTypes: rows(z.object({ name: z.string(), entities: count })).default([]), loosePages: count }),
  workers: z.object({ embedder: activity, summarizer: activity, categorizer: activity, wikiBuilder: activity }),
  pendingProposals: count,
});

const flaggedWire = z.object({
  groups: rows(z.object({ task: z.string(), cause: z.string(), count, lastFailedAt: timeSchema, sample: z.object({ id: z.union([z.string(), z.number()]).transform(String) }) }))
    .default([]),
});

const builderPauseWire = z.object({
  role: z.enum(["categorizer", "wiki-builder", "entity-builder"]),
  paused: z.boolean(),
  pausedAt: timeSchema.nullish(),
  pausedBy: z.string().nullish(),
  queued: count,
});
const builderPausesWire = z.object({ roles: rows(builderPauseWire) });

const toBuilderPause = (wire: z.infer<typeof builderPauseWire>): BuilderPause => ({
  role: wire.role,
  paused: wire.paused,
  queued: wire.queued,
  ...(wire.pausedAt ? { pausedAt: wire.pausedAt as IsoTime } : {}),
  ...(wire.pausedBy ? { pausedBy: wire.pausedBy } : {}),
});

/** 403 is a caller who is not the owner, and 503 a hub on SQLite, which has no pause. */
const noPauses = (error: unknown) =>
  error instanceof RouteMissingError || (error instanceof HttpError && [403, 404, 405, 503].includes(error.status));

const WORKERS: [WorkerId, keyof z.infer<typeof upkeepWire>["workers"]][] = [
  ["embedder", "embedder"],
  ["summarizer", "summarizer"],
  ["categorizer", "categorizer"],
  ["wiki-builder", "wikiBuilder"],
];

/** Reads the hub's own counts and upkeep state: `/api/memory/stats`, `/upkeep` and `/flagged`. */
export function createUpkeepClient(options: UpkeepClientOptions): UpkeepClient {
  const http = createHttp(options);
  return {
    async stats(): Promise<MemoryStats> {
      const [stats, upkeep] = await Promise.all([http.get("/api/memory/stats", statsWire), http.get("/api/memory/upkeep", upkeepWire)]);
      return {
        sessions: stats.conversations,
        messages: stats.messages,
        toolCalls: stats.toolCalls,
        summaries: stats.summaries,
        searchable: { embedded: stats.embeddedMessages, waiting: stats.embedQueueDepth, failed: stats.failedEmbeddings },
        filing: { byCategorizer: upkeep.filing.categorizer, byYou: upkeep.filing.you, notFiled: upkeep.filing.uncategorized, leftOut: upkeep.filing.leftOut, correctionsLastWeek: upkeep.filing.correctionsLastWeek },
        wiki: {
          topicPages: upkeep.wiki.topicPages,
          entities: upkeep.wiki.entityTypes.reduce((n, t) => n + t.entities, 0),
          entityTypes: upkeep.wiki.entityTypes.filter((t) => t.entities > 0).map((t) => ({ name: t.name, count: t.entities })),
          loosePages: upkeep.wiki.loosePages,
        },
        workers: WORKERS.map(([id, key]) => {
          const w = upkeep.workers[key];
          return { id, failing: w.failing, ...(w.lastFinishedAt ? { lastFinishedAt: w.lastFinishedAt as IsoTime } : {}) };
        }),
        toTidy: upkeep.pendingProposals,
      };
    },
    async flagged(): Promise<FlaggedGroup[]> {
      const body = await http.get("/api/memory/flagged", flaggedWire);
      return body.groups.map((g) => ({ id: g.sample.id, task: g.task, cause: g.cause, count: g.count, lastFailedAt: g.lastFailedAt as IsoTime }));
    },
    async builderPauses(): Promise<BuilderPause[] | null> {
      try {
        return (await http.get("/api/memory/workers/pauses", builderPausesWire)).roles.map(toBuilderPause);
      } catch (error) {
        if (noPauses(error)) return null;
        throw error;
      }
    },
    async setBuilderPaused(role: BuilderRole, paused: boolean): Promise<BuilderPause> {
      return toBuilderPause(await http.sendFor("PUT", `/api/memory/workers/${encodeURIComponent(role)}/pause`, builderPauseWire, { paused }));
    },
    retry: (id) => http.send("POST", `/api/memory/flagged/${encodeURIComponent(id)}/retry`),
    dismiss: (id) => http.send("POST", `/api/memory/flagged/${encodeURIComponent(id)}/dismiss`),
  };
}
