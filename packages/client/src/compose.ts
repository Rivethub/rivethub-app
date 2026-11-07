import type {
  Capability,
  MemoryClient,
  Page,
  SessionId,
  SessionQuery,
  SessionSummaryRow,
} from "@rivethub/contracts";
import { NetworkError, RouteMissingError } from "./errors.js";
import type { FetchLike } from "./http.js";
import { createRhClient, type LiveMethods } from "./rh/index.js";
import { toRow } from "./rh/util.js";
import { createSampleClient } from "./sample/client.js";

export interface ClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
}

const CAPABILITIES: Capability[] = [
  "today", "review", "topics", "entities", "sessions", "transcript",
  "summary-tree", "search", "harnesses", "models", "hubs", "account",
];

const unreachable = (error: unknown) => error instanceof RouteMissingError || error instanceof NetworkError;

/**
 * Live where the runtime answers, sample everywhere else. A missing route or an unreachable runtime
 * falls back to the sample world for that call and never reaches the UI as an error.
 */
export function createClient(options: ClientOptions): MemoryClient {
  const sample = createSampleClient();
  const rh = createRhClient(options);
  const probed = rh.probe().catch(() => ({}) as Awaited<ReturnType<typeof rh.probe>>);
  const live = async (capability: Capability) => (await probed)[capability] === "live";

  function choose<K extends keyof LiveMethods>(capability: Capability, name: K): LiveMethods[K] {
    const call = async (...args: unknown[]) => {
      const liveMethod = rh.methods[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
      if (liveMethod && (await live(capability))) {
        try {
          return await liveMethod(...args);
        } catch (error) {
          if (!unreachable(error)) throw error;
        }
      }
      return (sample[name] as (...a: unknown[]) => Promise<unknown>)(...args);
    };
    return call as LiveMethods[K];
  }

  const liveSessions = choose("sessions", "sessions");
  const liveSession = choose("sessions", "session");
  const liveKeep = choose("sessions", "keep");

  /** rh can only delete for good, so a UI trash is held here and filtered out of live lists. */
  const trashed = new Map<SessionId, SessionSummaryRow>();

  const client: MemoryClient = {
    async capabilities() {
      const answered = await probed;
      return Object.fromEntries(CAPABILITIES.map((capability) => [capability, answered[capability] ?? "sample"])) as Record<
        Capability,
        "live" | "sample"
      >;
    },

    today: sample.today,
    reviewQueue: sample.reviewQueue,
    decide: sample.decide,

    topicTree: choose("topics", "topicTree"),
    topic: choose("topics", "topic"),
    updateTopic: choose("topics", "updateTopic"),
    addDecision: choose("topics", "addDecision"),
    placeSession: choose("topics", "placeSession"),

    entities: sample.entities,
    entity: sample.entity,
    setFact: sample.setFact,

    async sessions(query: SessionQuery): Promise<Page<SessionSummaryRow>> {
      const page = await liveSessions(query);
      if (!(await live("sessions")) || trashed.size === 0) return page;
      if (query.view === "trash") {
        const known = new Set(page.items.map((row) => row.id));
        return { ...page, items: [...page.items, ...[...trashed.values()].filter((row) => !known.has(row.id))] };
      }
      return { ...page, items: page.items.filter((row) => !trashed.has(row.id)) };
    },
    session: liveSession,
    transcript: choose("transcript", "transcript"),
    summaryTree: choose("summary-tree", "summaryTree"),
    renameSession: choose("sessions", "renameSession"),
    setVisibility: choose("sessions", "setVisibility"),
    async keep(id, keep) {
      await liveKeep(id, keep);
      if (keep) trashed.delete(id);
    },
    async trash(ids) {
      if (!(await live("sessions"))) return sample.trash(ids);
      for (const id of ids) {
        const detail = await liveSession(id);
        trashed.set(id, { ...toRow(detail), trashed: true, kept: false });
      }
    },
    tag: sample.tag,

    search: choose("search", "search"),

    harnesses: sample.harnesses,
    connectHarness: sample.connectHarness,
    modelJobs: sample.modelJobs,

    hubs: sample.hubs,
    account: sample.account,
    updateAccount: sample.updateAccount,
  };
  return client;
}
