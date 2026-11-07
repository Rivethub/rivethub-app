import { describe, expect, it } from "vitest";
import { POLL_INTERVAL_MS, SIGN_IN_TTL_MS } from "../src/app.js";
import { RateLimiter } from "../src/ratelimit.js";
import { INSTALL_ID, PUBLIC_URL, relaxedLimits, startHarness } from "./harness.js";

const start = (h: Awaited<ReturnType<typeof startHarness>>, email: string) =>
  h.call("POST", "/v1/auth/start", { body: { email, installId: INSTALL_ID } });

describe("sign-in flow", () => {
  it("runs start, verify, poll, account, delete end to end", async () => {
    const h = await startHarness();
    const res = await start(h, "Ada@Example.com ");
    expect(res.status).toBe(200);
    const { requestId, pollIntervalMs } = (await res.json()) as { requestId: string; pollIntervalMs: number };
    expect(pollIntervalMs).toBe(POLL_INTERVAL_MS);

    expect(h.links).toHaveLength(1);
    expect(h.links[0]!.to).toBe("ada@example.com");
    const link = new URL(h.links[0]!.link);
    expect(link.origin).toBe(PUBLIC_URL);
    expect(link.pathname).toBe("/verify");
    expect(link.searchParams.get("r")).toBe(requestId);

    const pending = await h.call("POST", "/v1/auth/poll", { body: { requestId } });
    expect(pending.status).toBe(202);

    const verified = await h.call("GET", `/verify${link.search}`);
    expect(verified.status).toBe(200);
    expect(await verified.text()).toContain("You're signed in.");

    const poll = await h.call("POST", "/v1/auth/poll", { body: { requestId } });
    expect(poll.status).toBe(200);
    const { installToken, email } = (await poll.json()) as { installToken: string; email: string };
    expect(email).toBe("ada@example.com");

    const account = await h.call("GET", "/v1/account", { token: installToken });
    expect(await account.json()).toEqual({ email: "ada@example.com" });

    const del = await h.call("DELETE", "/v1/account", { token: installToken });
    expect(del.status).toBe(200);
    expect((await h.call("GET", "/v1/account", { token: installToken })).status).toBe(401);
    expect(h.store.signInEmails()).not.toContain("ada@example.com");
    expect(await h.store.counts()).toMatchObject({ users: 0 });
  });

  it("answers the same for a known and an unknown email", async () => {
    const h = await startHarness();
    await h.signIn("known@example.com");
    const a = await start(h, "known@example.com");
    const b = await start(h, "new@example.com");
    expect(a.status).toBe(b.status);
    expect(Object.keys(await a.json() as object)).toEqual(Object.keys(await b.json() as object));
  });

  it("rejects a wrong secret and a bad email", async () => {
    const h = await startHarness();
    await start(h, "a@example.com");
    const link = new URL(h.links[0]!.link);
    const wrong = await h.call("GET", `/verify?r=${link.searchParams.get("r")}&s=nope`);
    expect(wrong.status).toBe(410);
    expect((await start(h, "not-an-email")).status).toBe(422);
    expect((await h.call("POST", "/v1/auth/start", { body: { email: "a@example.com", installId: "x" } })).status).toBe(422);
  });

  it("makes the magic link single use", async () => {
    const h = await startHarness();
    await start(h, "a@example.com");
    const q = new URL(h.links[0]!.link).search;
    expect((await h.call("GET", `/verify${q}`)).status).toBe(200);
    expect((await h.call("GET", `/verify${q}`)).status).toBe(410);
  });

  it("hands out the install token once", async () => {
    const h = await startHarness();
    const { requestId } = await h.signIn("a@example.com");
    const again = await h.call("POST", "/v1/auth/poll", { body: { requestId } });
    expect(again.status).toBe(410);
  });

  it("expires after 15 minutes for verify and poll", async () => {
    const h = await startHarness();
    const res = await start(h, "a@example.com");
    const { requestId } = (await res.json()) as { requestId: string };
    const q = new URL(h.links[0]!.link).search;
    h.clock.now += SIGN_IN_TTL_MS + 1;
    expect((await h.call("GET", `/verify${q}`)).status).toBe(410);
    expect((await h.call("POST", "/v1/auth/poll", { body: { requestId } })).status).toBe(410);
  });

  it("expires a verified request that is never polled", async () => {
    const h = await startHarness();
    const { requestId } = (await (await start(h, "a@example.com")).json()) as { requestId: string };
    await h.call("GET", `/verify${new URL(h.links[0]!.link).search}`);
    h.clock.now += SIGN_IN_TTL_MS + 1;
    expect((await h.call("POST", "/v1/auth/poll", { body: { requestId } })).status).toBe(410);
  });

  it("returns 410 for an unknown request id", async () => {
    const h = await startHarness();
    expect((await h.call("POST", "/v1/auth/poll", { body: { requestId: "nope" } })).status).toBe(410);
  });

  it("keeps one user across sign-ins and binds each token to its install", async () => {
    const h = await startHarness();
    const first = await h.signIn("a@example.com");
    const second = await h.signIn("a@example.com", "7a1c3c2e-8a3e-4b1b-9d0a-1d6c1f4d9a22");
    expect(first.token).not.toBe(second.token);
    expect(await h.store.counts()).toMatchObject({ users: 1 });
    expect((await h.call("GET", "/v1/account", { token: first.token })).status).toBe(200);
    await h.call("DELETE", "/v1/account", { token: first.token });
    expect((await h.call("GET", "/v1/account", { token: second.token })).status).toBe(401);
  });

  it("signs out one token and leaves others valid", async () => {
    const h = await startHarness();
    const a = await h.signIn("a@example.com");
    const b = await h.signIn("a@example.com");
    expect((await h.call("POST", "/v1/auth/signout", { token: a.token })).status).toBe(200);
    expect((await h.call("GET", "/v1/account", { token: a.token })).status).toBe(401);
    expect((await h.call("GET", "/v1/account", { token: b.token })).status).toBe(200);
  });

  it("returns 401 for missing, malformed and unknown tokens", async () => {
    const h = await startHarness();
    expect((await h.call("GET", "/v1/account")).status).toBe(401);
    expect((await h.call("GET", "/v1/account", { token: "rht_bogus" })).status).toBe(401);
    expect((await h.call("DELETE", "/v1/account")).status).toBe(401);
    expect((await h.call("POST", "/v1/auth/signout")).status).toBe(401);
  });

  it("returns 502 and no request id when the email fails", async () => {
    const h = await startHarness();
    h.setMailFailure(true);
    const res = await start(h, "a@example.com");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "could not send email" });
  });
});

describe("sign-in rate limits", () => {
  it("limits per email", async () => {
    const h = await startHarness(relaxedLimits({ authEmail: new RateLimiter(2, 60_000) }));
    expect((await start(h, "a@example.com")).status).toBe(200);
    expect((await start(h, "A@example.com")).status).toBe(200);
    const limited = await start(h, "a@example.com");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await start(h, "b@example.com")).status).toBe(200);
  });

  it("limits per IP", async () => {
    const h = await startHarness(relaxedLimits({ authIp: new RateLimiter(2, 60_000) }));
    expect((await start(h, "a@example.com")).status).toBe(200);
    expect((await start(h, "b@example.com")).status).toBe(200);
    expect((await start(h, "c@example.com")).status).toBe(429);
  });

  it("limits polling per IP", async () => {
    const h = await startHarness(relaxedLimits({ pollIp: new RateLimiter(1, 60_000) }));
    expect((await h.call("POST", "/v1/auth/poll", { body: { requestId: "x" } })).status).toBe(410);
    expect((await h.call("POST", "/v1/auth/poll", { body: { requestId: "x" } })).status).toBe(429);
  });
});

describe("every response", () => {
  it("carries security headers and no CORS headers", async () => {
    const h = await startHarness();
    for (const [method, path] of [["GET", "/healthz"], ["GET", "/nope"], ["GET", "/v1/account"], ["GET", "/verify"]] as const) {
      const res = await h.call(method, path);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("strict-transport-security")).toBeTruthy();
      expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("serves healthz, 404 and 405", async () => {
    const h = await startHarness();
    expect(await (await h.call("GET", "/healthz")).json()).toEqual({ ok: true });
    expect((await h.call("GET", "/nope")).status).toBe(404);
    const res = await h.call("GET", "/v1/auth/start");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect((await h.call("OPTIONS", "/v1/auth/start")).status).toBe(405);
  });
});
