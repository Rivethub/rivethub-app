import type { ZodType } from "zod";
import { HttpError, MalformedResponseError, NetworkError, ReauthRequiredError, RouteMissingError } from "./errors.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** How a client authenticates to the local rh (rivethub-runtime CONTRACT note 147). */
export interface AuthSeam {
  /** Headers every request carries, such as `X-RH-CSRF`. Read on each request. */
  headers(): Record<string, string>;
  /** Called on a plain 401. A 401 that asks for a fresh sign-in (`ReauthRequiredError`) does not call it. */
  onUnauthorized?(): void;
}

export interface HttpOptions {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  auth?: AuthSeam;
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Http {
  get<T>(path: string, schema: ZodType<T>, query?: Record<string, string | number | undefined>): Promise<T>;
  send(method: Exclude<Method, "GET">, path: string, body?: unknown): Promise<void>;
  sendFor<T>(method: Exclude<Method, "GET">, path: string, schema: ZodType<T>, body?: unknown): Promise<T>;
  answers(path: string): Promise<boolean>;
}

const MISSING_ROUTE_BODY = "not found";
const PROBE_TIMEOUT_MS = 2_500;

function isTimeout(cause: unknown): boolean {
  return cause instanceof DOMException && (cause.name === "TimeoutError" || cause.name === "AbortError");
}

function query(params: Record<string, string | number | undefined> | undefined): string {
  if (!params) return "";
  const pairs = Object.entries(params).flatMap(([key, value]) =>
    value === undefined ? [] : [`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`],
  );
  return pairs.length ? `?${pairs.join("&")}` : "";
}

const REAUTH_REQUIRED = "reauth_required";

interface Failure {
  message: string;
  code?: string;
  sessions?: number[];
}

async function errorBody(response: Response): Promise<Failure> {
  const text = await response.text().catch(() => "");
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const failure: Failure = { message: typeof record["error"] === "string" ? record["error"] : text };
      const code = [record["code"], record["reason"]].find((value) => typeof value === "string");
      if (code !== undefined) failure.code = code as string;
      const sessions = record["sessions"];
      if (Array.isArray(sessions) && sessions.every((n) => typeof n === "number")) failure.sessions = sessions as number[];
      return failure;
    }
  } catch {
    // not JSON
  }
  return { message: text || response.statusText };
}

/**
 * Lets go of a response whose body nobody will read. Until a body is read or cancelled the browser keeps
 * its connection busy, and it opens only six per hub, so a dozen unread probes stall every real request
 * behind them until their timeouts fire.
 */
async function release(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // already read or already closed: nothing is held
  }
}

export function createHttp(options: HttpOptions): Http {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function request(method: Method, path: string, body?: unknown, timeoutMs: number = options.timeoutMs ?? 30_000): Promise<Response> {
    const headers: Record<string, string> = { accept: "application/json", ...options.auth?.headers() };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      headers["content-type"] = "application/json";
    }
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, init);
    } catch (cause) {
      throw new NetworkError(path, cause);
    }
    if (response.ok) return response;
    const failure = await errorBody(response);
    if (response.status === 405 || (response.status === 404 && failure.message === MISSING_ROUTE_BODY)) {
      throw new RouteMissingError(path);
    }
    if (response.status === 401) {
      if (failure.message === REAUTH_REQUIRED) throw new ReauthRequiredError(path);
      options.auth?.onUnauthorized?.();
    }
    throw new HttpError(response.status, path, failure.message, failure.code, failure.sessions);
  }

  async function parse<T>(response: Response, path: string, schema: ZodType<T>): Promise<T> {
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new MalformedResponseError(path, "body is not JSON");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new MalformedResponseError(
        path,
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; "),
      );
    }
    return parsed.data;
  }

  return {
    async get(path, schema, params) {
      const full = `${path}${query(params)}`;
      return parse(await request("GET", full), full, schema);
    },
    async send(method, path, body) {
      await release(await request(method, path, body));
    },
    async sendFor(method, path, schema, body) {
      return parse(await request(method, path, body), path, schema);
    },
    async answers(path) {
      try {
        await release(await request("GET", path, undefined, PROBE_TIMEOUT_MS));
        return true;
      } catch (error) {
        if (error instanceof HttpError) return true;
        return error instanceof NetworkError && isTimeout(error.cause);
      }
    },
  };
}
