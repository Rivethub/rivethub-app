import type { ZodType } from "zod";
import { HttpError, MalformedResponseError, NetworkError, RouteMissingError } from "./errors.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  baseUrl: string;
  fetch?: FetchLike;
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Http {
  get<T>(path: string, schema: ZodType<T, any, unknown>, query?: Record<string, string | number | undefined>): Promise<T>;
  send(method: Exclude<Method, "GET">, path: string, body?: unknown): Promise<void>;
  sendFor<T>(method: Exclude<Method, "GET">, path: string, schema: ZodType<T, any, unknown>, body?: unknown): Promise<T>;
  answers(path: string): Promise<boolean>;
}

const MISSING_ROUTE_BODY = "not found";

function query(params: Record<string, string | number | undefined> | undefined): string {
  if (!params) return "";
  const pairs = Object.entries(params).flatMap(([key, value]) =>
    value === undefined ? [] : [`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`],
  );
  return pairs.length ? `?${pairs.join("&")}` : "";
}

async function errorBody(response: Response): Promise<{ message: string; code?: string }> {
  const text = await response.text().catch(() => "");
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const message = typeof record["error"] === "string" ? record["error"] : text;
      const code = typeof record["code"] === "string" ? record["code"] : undefined;
      return code === undefined ? { message } : { message, code };
    }
  } catch {
    // not JSON
  }
  return { message: text || response.statusText };
}

export function createHttp(options: HttpOptions): Http {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function request(method: Method, path: string, body?: unknown): Promise<Response> {
    const init: RequestInit = { method, headers: { accept: "application/json" } };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { accept: "application/json", "content-type": "application/json" };
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
    throw new HttpError(response.status, path, failure.message, failure.code);
  }

  async function parse<T>(response: Response, path: string, schema: ZodType<T, any, unknown>): Promise<T> {
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
      await request(method, path, body);
    },
    async sendFor(method, path, schema, body) {
      return parse(await request(method, path, body), path, schema);
    },
    async answers(path) {
      try {
        await request("GET", path);
        return true;
      } catch (error) {
        if (error instanceof HttpError) return true;
        return false;
      }
    },
  };
}
