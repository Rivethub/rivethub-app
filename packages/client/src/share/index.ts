import type { ShareClient } from "@rivethub/contracts";
import { createHttp, type AuthSeam, type FetchLike } from "../http.js";
import * as wire from "./wire.js";

export interface ShareClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  auth?: AuthSeam;
}

/**
 * The share routes always run on the local rh: there is no sample world to
 * fall back to, so a missing route or an unreachable rh reaches the UI.
 *
 * A share code travels only in a POST body, never in a path or query, and
 * this client keeps no copy of it (rh does not either).
 */
export function createShareClient(options: ShareClientOptions): ShareClient {
  const http = createHttp({ ...options, timeoutMs: options.timeoutMs ?? 120_000 });
  const draftPath = (id: string) => `/api/share/drafts/${encodeURIComponent(id)}`;

  return {
    find: async ({ text, limit }) =>
      http.sendFor("POST", "/api/share/find", wire.findReply, { query: text, ...(limit === undefined ? {} : { limit }) }),

    createDraft: (sessions, options) =>
      http.sendFor("POST", "/api/share/drafts", wire.draftCreated, {
        ...(options?.decide === undefined ? {} : { decide: options.decide }),
        sessions: sessions.map(({ id, decision }) =>
          decision.kind === "approve"
            ? { id, decision: "approve" }
            : { id, decision: "redact", redact: { terms: decision.terms, drop_tool_outputs: decision.dropToolOutputs } },
        ),
      }),
    draft: (id) => http.get(draftPath(id), wire.draftReport),
    mark: (id, marks) =>
      http.sendFor("POST", `${draftPath(id)}/marks`, wire.marksReply, {
        marks: marks.map(({ number, choice, learn }) => ({ number, choice, ...(learn === undefined ? {} : { learn }) })),
      }),
    discard: (id) => http.send("DELETE", draftPath(id)),
    send: (id, { server, signed, confirm }) =>
      http.sendFor("POST", `${draftPath(id)}/send`, wire.sentReply, {
        server,
        signed,
        confirm: { sessions: confirm.sessions, kept_flags: confirm.keptFlags },
      }),

    servers: () => http.get("/api/share/servers", wire.serversReply),
    login: (request) => http.sendFor("POST", "/api/share/servers/login", wire.loginStep, request),
    pollLogin: (login) => http.sendFor("POST", "/api/share/servers/login/poll", wire.loginStep, { login }),
    logout: (origin) => http.send("POST", "/api/share/servers/logout", { origin }),
    key: () => http.get("/api/share/key", wire.keyReply),

    receive: (code) => http.sendFor("POST", "/api/share/receive", wire.receiveReport, { code }),
    importReceived: (code, { choices, force }) =>
      http.sendFor("POST", "/api/share/receive/import", wire.importReply, {
        code,
        sessions: choices.map(({ n, decision }) => ({ n, decision })),
        ...(force ? { force: true } : {}),
      }),
    trusted: async () => (await http.get("/api/share/trust", wire.trustReply)).senders,
    trust: (name, key) => http.send("POST", "/api/share/trust", { name, key }),
    untrust: async (name, key) => (await http.sendFor("DELETE", "/api/share/trust", wire.untrustReply, { name, ...(key === undefined ? {} : { key }) })).removed,
  };
}
