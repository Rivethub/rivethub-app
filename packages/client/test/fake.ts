import type { FetchLike } from "../src/http.js";

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Reply = unknown | { status: number; body: unknown };
type Handler = Reply | ((call: Call) => Reply);

const isReply = (value: unknown): value is { status: number; body: unknown } =>
  typeof value === "object" && value !== null && "status" in value && "body" in value;

/** A fake rh. Keys are "METHOD /path" (query string included when given); unmatched requests get the runtime's missing-route 404. */
export function fakeRh(routes: Record<string, Handler>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const call: Call = {
      method,
      path: `${url.pathname}${url.search}`,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const handler = routes[`${method} ${call.path}`] ?? routes[`${method} ${url.pathname}`];
    if (handler === undefined) return json(404, { error: "not found" });
    const reply = typeof handler === "function" ? handler(call) : handler;
    return isReply(reply) ? json(reply.status, reply.body) : json(200, reply);
  };
  return { fetch, calls };
}

function json(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const noContent = { status: 204, body: null };

export const offline: FetchLike = async () => {
  throw new TypeError("fetch failed");
};
