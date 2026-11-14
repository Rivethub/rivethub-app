import type {
  Capability,
  MemoryClient,
  Page,
  SessionId,
  SessionQuery,
  SessionSummaryRow,
} from "@rivethub/contracts";
import { NetworkError, RouteMissingError } from "./errors.js";
import type { AuthSeam, FetchLike } from "./http.js";
import { createRhClient, type LiveMethods } from "./rh/index.js";
import { toRow } from "./rh/util.js";
import { createSampleClient } from "./sample/client.js";

export interface ClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  /** How long one request may take before it is aborted. Defaults to 30 seconds. Capability probes stay at 2.5 seconds. */
  timeoutMs?: number;
  auth?: AuthSeam;
}

const CAPABILITIES: Capability[] = [
  "today", "review", "topics", "entities", "sessions", "transcript",
  "summary-tree", "search", "harnesses", "models", "hubs", "account",
];

/** Calls that only read. Only these may be sent before their capability has been probed. */
const READS: ReadonlySet<keyof LiveMethods> = new Set<keyof LiveMethods>([
  "today", "changes", "reviewQueue", "topicTree", "topic", "entities", "entity", "sessions", "session",
  "transcript", "summaryTree", "search", "harnesses", "modelJobs", "hubs", "account",
]);

type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown };
/** A promise that never rejects, so an answer nobody ends up using cannot surface as an unhandled rejection. */
const settle = (promise: Promise<unknown>): Promise<Outcome> =>
  promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );

const unreachable = (error: unknown) => error instanceof RouteMissingError || error instanceof NetworkError;

/**
 * Live where the runtime answers, sample everywhere else. A missing route or an unreachable runtime
 * falls back to the sample world for that call and never reaches the UI as an error.
 */
export function createClient(options: ClientOptions): MemoryClient {
  const sample = createSampleClient();
  const rh = createRhClient(options);
  /** The first read sent for each capability. Its answer settles whether the capability is live without a probe. */
  const firstRead = new Map<Capability, Promise<Outcome>>();
  /** Capabilities a read has already been answered for. A later failure on one of these is the hub's own error and is shown, not replaced with sample data. */
  const proven = new Set<Capability>();
  const probe = (capability: Capability) => rh.live(capability).catch(() => false);
  const live = async (capability: Capability) => {
    if (proven.has(capability)) return true;
    const read = firstRead.get(capability);
    if (read && (await read).ok) return true;
    if (proven.has(capability)) return true;
    return probe(capability);
  };

  function choose<K extends keyof LiveMethods>(capability: Capability, name: K): LiveMethods[K] {
    const call = async (...args: unknown[]) => {
      const liveMethod = rh.methods[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
      const fromSample = () => (sample[name] as (...a: unknown[]) => Promise<unknown>)(...args);
      if (!liveMethod) return fromSample();
      if (!READS.has(name)) {
        // A write changes the hub, so it goes out only once the capability is known to be there.
        if (!(await live(capability))) return fromSample();
        const outcome = await settle(liveMethod(...args));
        if (outcome.ok) return outcome.value;
        if (!unreachable(outcome.error)) throw outcome.error;
        return fromSample();
      }
      // A read goes out at once. If it answers, that is the capability's proof of life, and no probe asks the
      // same route a second time. If the route is missing or the hub cannot be reached, the sample world
      // serves this call. Any other failure is real only on a hub that has the capability.
      const read = settle(liveMethod(...args));
      if (!firstRead.has(capability)) firstRead.set(capability, read);
      const outcome = await read;
      if (outcome.ok) {
        proven.add(capability);
        return outcome.value;
      }
      if (unreachable(outcome.error) || !(await live(capability))) return fromSample();
      throw outcome.error;
    };
    return call as LiveMethods[K];
  }

  const liveSessions = choose("sessions", "sessions");
  const liveSession = choose("sessions", "session");
  const liveKeep = choose("sessions", "keep");

  /** Only a runtime without the session catalog lands here: it can delete for good but not trash, so a UI trash is held and filtered out of live lists. */
  const trashed = new Map<SessionId, SessionSummaryRow>();

  const client: MemoryClient = {
    async capabilities() {
      // Let the reads a screen sends in the same moment go first: each one that answers saves a probe.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const entries = await Promise.all(CAPABILITIES.map(async (capability) => [capability, (await live(capability)) ? "live" : "sample"] as const));
      return Object.fromEntries(entries) as Record<Capability, "live" | "sample">;
    },

    today: choose("today", "today"),
    changes: choose("today", "changes"),
    reviewQueue: choose("review", "reviewQueue"),
    decide: choose("review", "decide"),

    topicTree: choose("topics", "topicTree"),
    topic: choose("topics", "topic"),
    updateTopic: choose("topics", "updateTopic"),
    async createTopic(name, parentId) {
      const create = rh.methods.createTopic;
      if (!create || !(await live("topics"))) throw new Error("This hub cannot create topics.");
      return create(name, parentId);
    },
    addDecision: choose("topics", "addDecision"),
    placeSession: choose("topics", "placeSession"),

    entities: choose("entities", "entities"),
    entity: choose("entities", "entity"),
    setFact: choose("entities", "setFact"),

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
      try {
        return await rh.methods.trash!(ids);
      } catch (error) {
        if (!(error instanceof RouteMissingError)) throw error;
      }
      for (const id of ids) {
        const detail = await liveSession(id);
        trashed.set(id, { ...toRow(detail), trashed: true, kept: false });
      }
    },
    async restore(ids) {
      if (!(await live("sessions"))) return sample.restore(ids);
      try {
        return await rh.methods.restore!(ids);
      } catch (error) {
        if (!(error instanceof RouteMissingError)) throw error;
      }
      for (const id of ids) trashed.delete(id);
    },
    tag: sample.tag,

    search: choose("search", "search"),

    harnesses: choose("harnesses", "harnesses"),
    connectHarness: choose("harnesses", "connectHarness"),
    modelJobs: choose("models", "modelJobs"),

    hubs: choose("hubs", "hubs"),
    account: choose("account", "account"),
    updateAccount: choose("account", "updateAccount"),
    signIn: choose("account", "signIn"),
    pollSignIn: choose("account", "pollSignIn"),
    signOut: choose("account", "signOut"),
    deleteAccount: choose("account", "deleteAccount"),
  };
  return client;
}
