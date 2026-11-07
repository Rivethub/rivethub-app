import { crashReport, usageReport } from "@rivethub/contracts";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { z } from "zod";
import type { Config } from "./config.js";
import { installHash, randomToken, sha256Hex } from "./crypto.js";
import { logError, logRequest } from "./log.js";
import type { Mailer } from "./mail.js";
import { defaultLimits, type LimitResult, type Limits } from "./ratelimit.js";
import { compareVersions } from "./semver.js";
import { setSecurityHeaders } from "./security-headers.js";
import { channels, type Store } from "./store/types.js";

export const BODY_LIMIT_BYTES = 32 * 1024;
export const SIGN_IN_TTL_MS = 15 * 60_000;
const VERIFY_BODY_LIMIT_BYTES = 1024;
export const POLL_INTERVAL_MS = 2_000;

export interface AppDeps {
  store: Store;
  mailer: Mailer;
  config: Pick<Config, "publicUrl" | "trustProxy" | "telemetrySalt">;
  limits?: Limits;
  now?: () => number;
}

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  ip: string;
}

type Handler = (ctx: Ctx) => Promise<void>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(`http ${status}`);
  }
}

const startBody = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  installId: z.string().uuid(),
});
const verifyForm = z.object({
  r: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  s: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});
const pollBody = z.object({ requestId: z.string().min(1).max(64) });
const updatesQuery = z.object({
  channel: z.enum(channels),
  os: z.enum(["linux-x86_64", "linux-aarch64", "macos-x86_64", "macos-aarch64", "windows-x86_64"]),
});

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendHtml(res: ServerResponse, status: number, title: string, message: string, extra = ""): void {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#111;color:#eee}main{text-align:center;padding:1rem}h1{font-size:1.4rem}button{font:inherit;padding:.6rem 1.2rem;border-radius:.4rem;border:0;background:#eee;color:#111;cursor:pointer}</style></head><body><main><h1>${title}</h1><p>${message}</p>${extra}</main></body></html>`;
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
  });
  res.end(html);
}

function enforce(result: LimitResult): void {
  if (!result.ok) {
    throw new HttpError(429, { error: "rate limited" }, { "retry-after": String(result.retryAfterSec) });
  }
}

async function readRaw(req: IncomingMessage, limit: number): Promise<string> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) throw new HttpError(413, { error: "body too large" }, { connection: "close" });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, { error: "body too large" }, { connection: "close" });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  try {
    return JSON.parse(await readRaw(req, BODY_LIMIT_BYTES));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(422, { error: "invalid body" });
  }
}

function parseBody<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, { error: "invalid body" });
  return parsed.data;
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const last = (Array.isArray(xff) ? xff.join(",") : (xff ?? "")).split(",").at(-1)?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function createApp(deps: AppDeps): RequestListener {
  const { store, mailer, config } = deps;
  const limits = deps.limits ?? defaultLimits();
  const now = deps.now ?? Date.now;

  async function requireSession(ctx: Ctx) {
    const match = /^Bearer (\S+)$/.exec(ctx.req.headers.authorization ?? "");
    const tokenHash = match ? sha256Hex(match[1]!) : null;
    const session = tokenHash ? await store.findSession(tokenHash) : null;
    if (!tokenHash || !session) {
      throw new HttpError(401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
    }
    return { tokenHash, session };
  }

  const routes: Record<string, Partial<Record<string, Handler>>> = {
    "/healthz": {
      GET: async ({ res }) => send(res, 200, { ok: true }),
    },

    "/v1/auth/start": {
      POST: async ({ req, res, ip }) => {
        enforce(limits.authIp.hit(ip, now()));
        const { email } = parseBody(startBody, await readJson(req));
        enforce(limits.authEmail.hit(email, now()));
        const id = randomToken(16);
        const secret = randomToken(32);
        await store.createSignIn({
          id,
          secretHash: sha256Hex(secret),
          email,
          expiresAt: new Date(now() + SIGN_IN_TTL_MS),
        });
        const link = `${config.publicUrl}/verify?r=${id}&s=${secret}`;
        try {
          await mailer.sendMagicLink(email, link);
        } catch (err) {
          logError(err);
          throw new HttpError(502, { error: "could not send email" });
        }
        send(res, 200, { requestId: id, pollIntervalMs: POLL_INTERVAL_MS });
      },
    },

    "/verify": {
      GET: async ({ res, url }) => {
        const parsed = verifyForm.safeParse({ r: url.searchParams.get("r"), s: url.searchParams.get("s") });
        if (!parsed.success) return sendHtml(res, 410, "This link is not valid.", "Go back to RivetHub and ask for a new one.");
        const { r, s } = parsed.data;
        sendHtml(
          res,
          200,
          "Confirm sign-in",
          "Only confirm if you just asked to sign in to RivetHub.",
          `<form method="post" action="/verify"><input type="hidden" name="r" value="${r}"><input type="hidden" name="s" value="${s}"><button type="submit">Confirm sign-in</button></form>`,
        );
      },
      POST: async ({ req, res }) => {
        if (!/^application\/x-www-form-urlencoded\b/i.test(req.headers["content-type"] ?? "")) {
          throw new HttpError(415, { error: "unsupported media type" });
        }
        const form = new URLSearchParams(await readRaw(req, VERIFY_BODY_LIMIT_BYTES));
        const parsed = verifyForm.safeParse({ r: form.get("r"), s: form.get("s") });
        if (!parsed.success) throw new HttpError(400, { error: "invalid body" });
        const ok = await store.verifySignIn(parsed.data.r, sha256Hex(parsed.data.s), new Date(now()));
        if (ok) sendHtml(res, 200, "You're signed in.", "Go back to RivetHub.");
        else sendHtml(res, 410, "This link has expired.", "Go back to RivetHub and ask for a new one.");
      },
    },

    "/v1/auth/poll": {
      POST: async ({ req, res, ip }) => {
        enforce(limits.pollIp.hit(ip, now()));
        const { requestId } = parseBody(pollBody, await readJson(req));
        const token = `rht_${randomToken(32)}`;
        const outcome = await store.completeSignIn(requestId, sha256Hex(token), new Date(now()));
        if (outcome.kind === "pending") return send(res, 202, { status: "pending" });
        if (outcome.kind === "expired") return send(res, 410, { error: "expired" });
        send(res, 200, { installToken: token, email: outcome.email });
      },
    },

    "/v1/auth/signout": {
      POST: async (ctx) => {
        const { tokenHash } = await requireSession(ctx);
        await store.revokeToken(tokenHash);
        send(ctx.res, 200, { ok: true });
      },
    },

    "/v1/account": {
      GET: async (ctx) => {
        const { session } = await requireSession(ctx);
        send(ctx.res, 200, { email: session.email });
      },
      DELETE: async (ctx) => {
        const { session } = await requireSession(ctx);
        await store.deleteUser(session.userId);
        send(ctx.res, 200, { ok: true });
      },
    },

    "/v1/telemetry/crash": {
      POST: async ({ req, res, ip }) => {
        enforce(limits.telemetryIp.hit(ip, now()));
        const report = parseBody(crashReport, await readJson(req));
        enforce(limits.telemetryInstall.hit(`crash|${report.installId}|${ip}`, now()));
        const { installId: _id, ...rest } = report;
        await store.addCrash({ ...rest, installHash: installHash(config.telemetrySalt, report.installId) }, new Date(now()));
        res.writeHead(202).end();
      },
    },

    "/v1/telemetry/usage": {
      POST: async ({ req, res, ip }) => {
        enforce(limits.telemetryIp.hit(ip, now()));
        const report = parseBody(usageReport, await readJson(req));
        enforce(limits.telemetryInstall.hit(`usage|${report.installId}|${ip}`, now()));
        const { installId: _id, ...rest } = report;
        await store.addUsage({ ...rest, installHash: installHash(config.telemetrySalt, report.installId) }, new Date(now()));
        res.writeHead(202).end();
      },
    },

    "/v1/updates/latest": {
      GET: async (ctx) => {
        await requireSession(ctx);
        const parsed = updatesQuery.safeParse(Object.fromEntries(ctx.url.searchParams));
        if (!parsed.success) throw new HttpError(422, { error: "invalid query" });
        const releases = await store.listReleases(parsed.data.channel, parsed.data.os);
        const latest = releases.sort((a, b) => compareVersions(b.version, a.version))[0];
        if (!latest) return void ctx.res.writeHead(204).end();
        const { version, url, sha256, signature, notesUrl } = latest;
        send(ctx.res, 200, { version, url, sha256, signature, notesUrl });
      },
    },
  };

  return (req, res) => {
    const started = Date.now();
    setSecurityHeaders(res);
    const url = new URL(req.url ?? "/", "http://localhost");
    res.on("finish", () =>
      logRequest({ method: req.method ?? "", path: url.pathname, status: res.statusCode, ms: Date.now() - started }),
    );
    const route = routes[url.pathname];
    const handler = route?.[req.method ?? ""];
    const run = async (): Promise<void> => {
      if (!route) throw new HttpError(404, { error: "not found" });
      if (!handler) throw new HttpError(405, { error: "method not allowed" }, { allow: Object.keys(route).join(", ") });
      await handler({ req, res, url, ip: clientIp(req, config.trustProxy) });
    };
    run().catch((err: unknown) => {
      if (res.headersSent) return void res.destroy();
      if (err instanceof HttpError) return send(res, err.status, err.body, err.headers);
      logError(err);
      send(res, 500, { error: "internal error" });
    });
  };
}
