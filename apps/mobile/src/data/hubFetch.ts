import type { FetchLike } from "@rivethub/client";

export interface RequestTrack {
  dataTimeouts: number;
  quickFailures: number;
}

/** Probe aborts are 2.5s. A data abort at the phone's 15s timeout lands past this floor. */
const DATA_TIMEOUT_FLOOR_MS = 8_000;

export function createHubFetch(token: string | undefined, track: RequestTrack): FetchLike {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    const raw = token?.replace(/^Bearer\s+/i, "");
    if (raw) headers.set("authorization", `Bearer ${raw}`);
    const started = Date.now();
    const signal = init?.signal;
    const onAbort = () => {
      if (Date.now() - started >= DATA_TIMEOUT_FLOOR_MS) track.dataTimeouts += 1;
    };
    signal?.addEventListener("abort", onAbort);
    try {
      return await fetch(input, { ...init, headers });
    } catch (error) {
      if (!signal?.aborted) track.quickFailures += 1;
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

export function isTimeoutCause(cause: unknown): boolean {
  return cause instanceof DOMException && (cause.name === "TimeoutError" || cause.name === "AbortError");
}
