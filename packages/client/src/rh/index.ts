import type { Capability, MemoryClient } from "@rivethub/contracts";
import { createHttp, type FetchLike } from "../http.js";
import { accountApi } from "./account.js";
import { catalogApi } from "./catalog.js";
import { entitiesApi } from "./entities.js";
import { reviewApi } from "./review.js";
import { searchApi } from "./search.js";
import { setupApi } from "./setup.js";
import { sessionsApi } from "./sessions.js";
import { todayApi } from "./today.js";
import { topicsApi } from "./topics.js";

export type LiveMethods = Omit<MemoryClient, "capabilities">;

export interface RhClient {
  methods: Partial<LiveMethods>;
  /** Whether this runtime has the session catalog, so lists, details and trash are served by it. */
  catalog(): Promise<boolean>;
  /** Capabilities whose rh routes answered right now. */
  probe(): Promise<Partial<Record<Capability, "live">>>;
}

export interface RhOptions {
  baseUrl: string;
  fetch?: FetchLike;
}

/** Routes of which one must answer for a capability to count as live. A 404 with the runtime's "not found" body means the route is absent. */
const PROBES: Partial<Record<Capability, string[]>> = {
  today: ["/api/today"],
  review: ["/api/review"],
  account: ["/api/account"],
  hubs: ["/api/hubs"],
  topics: ["/api/topics"],
  entities: ["/api/entities"],
  sessions: ["/api/sessions?limit=1", "/api/harnesses"],
  harnesses: ["/api/capture/status"],
  models: ["/api/memory/models"],
  transcript: ["/api/harness-sessions/previews"],
  "summary-tree": ["/api/memory/summaries/probe"],
  search: ["/api/topics/search?q=probe"],
};

export function createRhClient(options: RhOptions): RhClient {
  const http = createHttp(options);
  const topics = topicsApi(http);
  const sessions = sessionsApi(http, topics.loadTopics);
  const search = searchApi(http);
  const catalog = catalogApi(http);
  const entities = entitiesApi(http);
  const setup = setupApi(http);
  const review = reviewApi(http);
  const today = todayApi(http);
  const account = accountApi(http);

  /** The catalog serves a call when this runtime has it; otherwise the client-side merge does. */
  const viaCatalog = <A extends unknown[], R>(fromCatalog: (...a: A) => Promise<R>, merged: (...a: A) => Promise<R>) =>
    async (...args: A): Promise<R> => ((await catalog.catalog()) ? fromCatalog(...args) : merged(...args));

  return {
    methods: {
      topicTree: topics.topicTree,
      topic: topics.topic,
      updateTopic: topics.updateTopic,
      addDecision: topics.addDecision,
      placeSession: sessions.placeSession,
      sessions: viaCatalog(catalog.sessions, sessions.sessions),
      session: viaCatalog(catalog.session, sessions.session),
      trash: catalog.trash,
      restore: catalog.restore,
      entities: entities.entities,
      entity: entities.entity,
      setFact: entities.setFact,
      harnesses: setup.harnesses,
      connectHarness: setup.connectHarness,
      modelJobs: setup.modelJobs,
      transcript: sessions.transcript,
      summaryTree: sessions.summaryTree,
      renameSession: sessions.renameSession,
      setVisibility: sessions.setVisibility,
      keep: async (id, keep) => (keep ? sessions.keep(id, true) : catalog.unkeep(id)),
      search: search.search,
      today: today.today,
      changes: today.changes,
      reviewQueue: review.reviewQueue,
      decide: review.decide,
      account: account.account,
      updateAccount: account.updateAccount,
      signIn: account.signIn,
      pollSignIn: account.pollSignIn,
      signOut: account.signOut,
      deleteAccount: account.deleteAccount,
      hubs: account.hubs,
    },
    catalog: catalog.catalog,
    async probe() {
      const entries = await Promise.all(
        Object.entries(PROBES).map(async ([capability, paths]) => [capability, (await Promise.all(paths.map((path) => http.answers(path)))).some(Boolean)] as const),
      );
      return Object.fromEntries(entries.filter(([, ok]) => ok).map(([capability]) => [capability, "live" as const]));
    },
  };
}
