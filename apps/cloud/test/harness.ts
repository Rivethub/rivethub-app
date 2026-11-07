import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach } from "vitest";
import { createApp } from "../src/app.js";
import type { Mailer } from "../src/mail.js";
import { RateLimiter, type Limits } from "../src/ratelimit.js";
import { MemoryStore } from "../src/store/memory.js";
import type { Store } from "../src/store/types.js";

export const PUBLIC_URL = "https://cloud.test";
export const SALT = "test-salt-0123456789abcdef";
export const INSTALL_ID = "3f1c3c2e-8a3e-4b1b-9d0a-1d6c1f4d9a11";

export interface Harness {
  base: string;
  store: Store;
  links: { to: string; link: string }[];
  clock: { now: number };
  setMailFailure(on: boolean): void;
  call(method: string, path: string, init?: { body?: unknown; token?: string; raw?: string }): Promise<Response>;
  confirm(link: string): Promise<Response>;
  signIn(email: string, installId?: string): Promise<{ token: string; requestId: string }>;
}

const open: Server[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise((r) => s.close(r))));
});

export function relaxedLimits(over: Partial<Limits> = {}): Limits {
  const big = () => new RateLimiter(10_000, 60_000);
  return { authEmail: big(), authIp: big(), pollIp: big(), telemetryIp: big(), telemetryInstall: big(), ...over };
}

export async function startHarness(limits: Limits = relaxedLimits(), store: Store = new MemoryStore()): Promise<Harness> {
  const links: Harness["links"] = [];
  const clock = { now: Date.parse("2026-01-01T00:00:00Z") };
  let failMail = false;
  const mailer: Mailer = {
    async sendMagicLink(to, link) {
      if (failMail) throw new Error("boom");
      links.push({ to, link });
    },
  };
  const server = createServer(
    createApp({ store, mailer, config: { publicUrl: PUBLIC_URL, trustProxy: false, telemetrySalt: SALT }, limits, now: () => clock.now }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  open.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call: Harness["call"] = (method, path, init = {}) => {
    const payload = init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : null);
    return fetch(base + path, {
      method,
      headers: {
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(payload !== null ? { "content-type": "application/json" } : {}),
      },
      body: payload,
    });
  };

  const confirm: Harness["confirm"] = (link) => {
    const q = new URL(link).searchParams;
    return fetch(base + "/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ r: q.get("r") ?? "", s: q.get("s") ?? "" }),
    });
  };

  const h: Harness = {
    base,
    store,
    links,
    clock,
    setMailFailure: (on) => void (failMail = on),
    call,
    confirm,
    async signIn(email, installId = INSTALL_ID) {
      const start = await call("POST", "/v1/auth/start", { body: { email, installId } });
      const { requestId } = (await start.json()) as { requestId: string };
      await confirm(links.at(-1)!.link);
      const poll = await call("POST", "/v1/auth/poll", { body: { requestId } });
      const { installToken } = (await poll.json()) as { installToken: string };
      return { token: installToken, requestId };
    },
  };
  return h;
}
