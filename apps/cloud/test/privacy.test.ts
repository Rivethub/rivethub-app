import { describe, expect, it } from "vitest";
import { installHash } from "../src/crypto.js";
import { purge } from "../src/purge.js";
import { MemoryStore } from "../src/store/memory.js";
import { INSTALL_ID, SALT, startHarness } from "./harness.js";

const crash = {
  schema: 1,
  installId: INSTALL_ID,
  rh: "0.7.2",
  os: "linux-x86_64",
  job: "gateway",
  kind: "panic",
  where: "rh_gateway::router::dispatch:218",
  frames: ["rh_gateway::router::dispatch:218"],
  at: "2026-01-01T00:00:00.000Z",
};
const usage = {
  schema: 1,
  installId: INSTALL_ID,
  rh: "0.7.2",
  os: "linux-x86_64",
  day: "2026-01-01",
  counts: { searches: 4 },
};
const DAY = 86_400_000;

describe("unlinkable telemetry", () => {
  it("keeps the raw installId out of every stored row after sign-in and a crash report", async () => {
    const h = await startHarness();
    const store = h.store as MemoryStore;
    const start = await h.call("POST", "/v1/auth/start", { body: { email: "a@example.com", installId: INSTALL_ID } });
    expect(start.status).toBe(200);
    const { token } = await h.signIn("a@example.com", INSTALL_ID);
    expect((await h.call("GET", "/v1/account", { token })).status).toBe(200);
    expect((await h.call("POST", "/v1/telemetry/crash", { body: crash })).status).toBe(202);
    expect((await h.call("POST", "/v1/telemetry/usage", { body: usage })).status).toBe(202);

    const dump = store.dump();
    expect(dump.toLowerCase()).not.toContain(INSTALL_ID);
    expect(dump).toContain(installHash(SALT, INSTALL_ID));
    expect(await store.counts()).toMatchObject({ users: 1, crashes: 1, usage: 1 });
  });

  it("hashes with a keyed, case-insensitive HMAC", () => {
    expect(installHash(SALT, INSTALL_ID)).toMatch(/^[0-9a-f]{64}$/);
    expect(installHash(SALT, INSTALL_ID.toUpperCase())).toBe(installHash(SALT, INSTALL_ID));
    expect(installHash("another-salt-0123456789", INSTALL_ID)).not.toBe(installHash(SALT, INSTALL_ID));
  });
});

describe("telemetry retention", () => {
  it("purges crash and usage rows older than the retention window with an injected clock", async () => {
    const store = new MemoryStore();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const stored = (n: number) => ({ installHash: `h${n}`, schema: 1 as const, rh: "1", os: "linux-x86_64" as const });
    await store.addCrash({ ...stored(1), job: "cli", kind: "panic", where: "a:1", frames: ["a:1"], at: t0.toISOString() }, t0);
    await store.addUsage({ ...stored(1), day: "2026-01-01", counts: { searches: 1 } }, t0);
    const t1 = new Date(t0.getTime() + 60 * DAY);
    await store.addCrash({ ...stored(2), job: "cli", kind: "panic", where: "a:1", frames: ["a:1"], at: t1.toISOString() }, t1);
    await store.addUsage({ ...stored(2), day: "2026-03-02", counts: { searches: 1 } }, t1);

    await purge(store, new Date(t0.getTime() + 89 * DAY), 90);
    expect(await store.counts()).toMatchObject({ crashes: 2, usage: 2 });

    await purge(store, new Date(t0.getTime() + 91 * DAY), 90);
    expect(await store.counts()).toMatchObject({ crashes: 1, usage: 1 });

    await purge(store, new Date(t0.getTime() + 91 * DAY), 30);
    expect(await store.counts()).toMatchObject({ crashes: 0, usage: 0 });
  });
});
