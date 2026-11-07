import type { Capability, MemoryClient } from "@rivethub/contracts";
import { createHttp, type FetchLike } from "../http.js";
import { searchApi } from "./search.js";
import { sessionsApi } from "./sessions.js";
import { topicsApi } from "./topics.js";

export type LiveMethods = Omit<MemoryClient, "capabilities">;

export interface RhClient {
  methods: Partial<LiveMethods>;
  /** Capabilities whose rh routes answered right now. */
  probe(): Promise<Partial<Record<Capability, "live">>>;
}

export interface RhOptions {
  baseUrl: string;
  fetch?: FetchLike;
}

/** Route that must answer for a capability to count as live. A 404 with the runtime's "not found" body means the route is absent. */
const PROBES: Partial<Record<Capability, string>> = {
  topics: "/api/topics",
  sessions: "/api/harnesses",
  transcript: "/api/harness-sessions/previews",
  "summary-tree": "/api/memory/summaries/probe",
  search: "/api/topics/search?q=probe",
};

export function createRhClient(options: RhOptions): RhClient {
  const http = createHttp(options);
  const topics = topicsApi(http);
  const sessions = sessionsApi(http, topics.loadTopics);
  const search = searchApi(http);

  return {
    methods: {
      topicTree: topics.topicTree,
      topic: topics.topic,
      updateTopic: topics.updateTopic,
      addDecision: topics.addDecision,
      placeSession: sessions.placeSession,
      sessions: sessions.sessions,
      session: sessions.session,
      transcript: sessions.transcript,
      summaryTree: sessions.summaryTree,
      renameSession: sessions.renameSession,
      setVisibility: sessions.setVisibility,
      keep: sessions.keep,
      search: search.search,
    },
    async probe() {
      const entries = await Promise.all(
        Object.entries(PROBES).map(async ([capability, path]) => [capability, await http.answers(path)] as const),
      );
      return Object.fromEntries(entries.filter(([, ok]) => ok).map(([capability]) => [capability, "live" as const]));
    },
  };
}
