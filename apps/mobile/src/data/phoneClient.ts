import { createClient, createRhClient, createSampleClient, NetworkError } from "@rivethub/client";
import type { Capability, MemoryClient } from "@rivethub/contracts";
import type { HubRecord } from "../hub/records";
import type { ResponseCache } from "./cache";
import { createHubFetch, isTimeoutCause, type RequestTrack } from "./hubFetch";
import { fallbackNotice, MISSING_NOTICE, type Notice, type Notices } from "./notices";

export const HUB_TIMEOUT_MS = 15_000;

const WRITES = new Set<keyof MemoryClient>([
  "decide",
  "updateTopic",
  "addDecision",
  "placeSession",
  "setFact",
  "renameSession",
  "setVisibility",
  "keep",
  "trash",
  "restore",
  "tag",
  "connectHarness",
  "updateAccount",
  "signIn",
  "signOut",
  "deleteAccount",
]);

const CAPABILITY: Partial<Record<keyof MemoryClient, Capability>> = {
  today: "today",
  changes: "today",
  reviewQueue: "review",
  topicTree: "topics",
  topic: "topics",
  entities: "entities",
  entity: "entities",
  sessions: "sessions",
  session: "sessions",
  transcript: "transcript",
  summaryTree: "summary-tree",
  search: "search",
  harnesses: "harnesses",
  modelJobs: "models",
  hubs: "hubs",
  account: "account",
  pollSignIn: "account",
};

export interface PhoneClient extends MemoryClient {
  readonly hubId: string | null;
  readonly scope: string;
  peek<T>(method: string, args: readonly unknown[]): T | undefined;
  getNotice(): Notice | null;
  subscribe(listener: () => void): () => void;
}

export function createPhoneClient(options: {
  hub: HubRecord | null;
  cache: ResponseCache;
  track: RequestTrack;
  notices: Notices;
}): PhoneClient {
  const { hub, cache, track, notices } = options;
  if (!hub) {
    const demo = createSampleClient();
    return Object.assign(demo, {
      hubId: null,
      scope: "sample",
      peek: () => undefined,
      getNotice: () => notices.get(),
      subscribe: (listener: () => void) => notices.subscribe(listener),
    });
  }

  const fetchImpl = createHubFetch(hub.token, track);
  const inner = createClient({ baseUrl: hub.url, fetch: fetchImpl, timeoutMs: HUB_TIMEOUT_MS });
  const rh = createRhClient({ baseUrl: hub.url, fetch: fetchImpl, timeoutMs: HUB_TIMEOUT_MS });
  const scope = `${hub.id}:${tokenMark(hub.token)}`;
  const cacheKey = (method: string, args: readonly unknown[]) => `${scope}:${method}:${JSON.stringify(args)}`;

  const read = <K extends keyof MemoryClient>(key: K): MemoryClient[K] => {
    const fn = inner[key] as (...args: never[]) => Promise<unknown>;
    return (async (...args: never[]) => {
      const id = cacheKey(key, args);
      const timeouts = track.dataTimeouts;
      const failures = track.quickFailures;
      const value = await fn(...args);
      const timedOut = track.dataTimeouts > timeouts;
      const offline = track.quickFailures > failures;
      if (timedOut || offline) {
        const saved = cache.peek(id);
        const notice = fallbackNotice(timedOut ? "timeout" : "offline", saved !== undefined);
        if (saved !== undefined) {
          notices.fail(id, notice);
          return saved;
        }
        notices.fail(id, notice);
        return value;
      }
      if (key !== "capabilities") {
        const caps = await inner.capabilities();
        const capability = CAPABILITY[key];
        if (capability && caps[capability] !== "live") {
          notices.fail(id, MISSING_NOTICE);
          return value;
        }
        await cache.set(id, value);
      }
      notices.ok(id);
      return value;
    }) as MemoryClient[K];
  };

  const write = <K extends keyof MemoryClient>(key: K): MemoryClient[K] =>
    (async (...args: never[]) => {
      const method = rh.methods[key as keyof typeof rh.methods];
      if (!method) throw new Error("This hub cannot do that yet.");
      try {
        return await (method as (...a: never[]) => Promise<unknown>)(...args);
      } catch (error) {
        if (error instanceof NetworkError) {
          throw new Error(isTimeoutCause(error.cause) ? "The hub took too long. Nothing was saved." : "The hub did not answer. Nothing was saved.");
        }
        throw error;
      }
    }) as MemoryClient[K];

  const methods = {} as MemoryClient;
  const slot = methods as Record<keyof MemoryClient, MemoryClient[keyof MemoryClient]>;
  for (const key of Object.keys(inner) as (keyof MemoryClient)[]) {
    slot[key] = (WRITES.has(key) ? write(key) : read(key)) as MemoryClient[keyof MemoryClient];
  }
  return Object.assign(methods, {
    hubId: hub.id,
    scope,
    peek: <T,>(method: string, args: readonly unknown[]) => cache.peek<T>(cacheKey(method, args)),
    getNotice: () => notices.get(),
    subscribe: (listener: () => void) => notices.subscribe(listener),
  });
}

function tokenMark(token: string | undefined): string {
  if (!token) return "0";
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) hash = (Math.imul(hash, 31) + token.charCodeAt(index)) >>> 0;
  return hash.toString(16);
}
