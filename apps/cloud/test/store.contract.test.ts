import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installHash } from "../src/crypto.js";
import { migrate } from "../src/store/migrate.js";
import { MemoryStore } from "../src/store/memory.js";
import { PostgresStore } from "../src/store/postgres.js";
import type { Release, Store } from "../src/store/types.js";
import { INSTALL_ID, SALT, startHarness } from "./harness.js";

const now = new Date("2026-01-01T00:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const release: Release = {
  channel: "stable",
  os: "linux-x86_64",
  version: "1.0.0",
  url: "https://example.com/a.tar.gz",
  sha256: "b".repeat(64),
  signature: "sig",
  notesUrl: "https://example.com/notes",
};

function contract(name: string, make: () => Promise<Store>) {
  describe(`${name} store`, () => {
    let store: Store;
    beforeAll(async () => {
      store = await make();
    });
    afterAll(async () => {
      await store.close();
    });

    const signIn = (id: string, email: string, ttl = 60_000) =>
      store.createSignIn({ id, secretHash: `h-${id}`, email, expiresAt: later(ttl) });

    it("verifies once, only with the right secret, before expiry", async () => {
      await signIn("r1", "a@x.co");
      expect(await store.verifySignIn("r1", "wrong", now)).toBe(false);
      expect(await store.verifySignIn("r1", "h-r1", later(61_000))).toBe(false);
      expect(await store.verifySignIn("r1", "h-r1", now)).toBe(true);
      expect(await store.verifySignIn("r1", "h-r1", now)).toBe(false);
    });

    it("completes a verified sign-in exactly once and creates the user once", async () => {
      await signIn("r2", "b@x.co");
      expect((await store.completeSignIn("r2", "t-pending", now)).kind).toBe("pending");
      await store.verifySignIn("r2", "h-r2", now);
      expect(await store.completeSignIn("r2", "t-r2", now)).toEqual({ kind: "signedIn", email: "b@x.co" });
      expect((await store.completeSignIn("r2", "t-r2b", now)).kind).toBe("expired");
      await signIn("r3", "b@x.co");
      await store.verifySignIn("r3", "h-r3", now);
      await store.completeSignIn("r3", "t-r3", now);
      const a = await store.findSession("t-r2");
      const b = await store.findSession("t-r3");
      expect(a?.email).toBe("b@x.co");
      expect(a?.userId).toBe(b?.userId);
      expect(await store.findSession("t-r2b")).toBeNull();
    });

    it("reports expired for unknown and timed-out requests", async () => {
      expect((await store.completeSignIn("missing", "t", now)).kind).toBe("expired");
      await signIn("r4", "c@x.co", 1000);
      await store.verifySignIn("r4", "h-r4", now);
      expect((await store.completeSignIn("r4", "t-r4", later(2000))).kind).toBe("expired");
    });

    it("revokes one token and deletes a user with their tokens and requests", async () => {
      await signIn("r5", "d@x.co");
      await store.verifySignIn("r5", "h-r5", now);
      await store.completeSignIn("r5", "t-r5", now);
      await signIn("r6", "d@x.co");
      await store.verifySignIn("r6", "h-r6", now);
      await store.completeSignIn("r6", "t-r6", now);
      await store.revokeToken("t-r5");
      expect(await store.findSession("t-r5")).toBeNull();
      const session = await store.findSession("t-r6");
      await signIn("r7", "d@x.co");
      await store.deleteUser(session!.userId);
      expect(await store.findSession("t-r6")).toBeNull();
      expect(await store.verifySignIn("r7", "h-r7", now)).toBe(false);
    });

    it("purges expired sign-in requests", async () => {
      await signIn("r8", "e@x.co", 1000);
      await store.purgeExpired(later(5000));
      expect(await store.verifySignIn("r8", "h-r8", now)).toBe(false);
    });

    it("stores crashes and one usage row per install and day", async () => {
      const before = await store.counts();
      const installHash = randomUUID();
      const crash = {
        schema: 1 as const,
        installHash,
        rh: "1.0.0",
        os: "linux-x86_64" as const,
        job: "cli" as const,
        kind: "panic" as const,
        where: "a::b:1",
        frames: ["a::b:1"],
        at: "2026-01-01T00:00:00.000Z",
      };
      await store.addCrash(crash, now);
      const usage = { schema: 1 as const, installHash, rh: "1.0.0", os: "linux-x86_64" as const, day: "2026-01-01", counts: { searches: 1 } };
      await store.addUsage(usage, now);
      await store.addUsage({ ...usage, counts: { searches: 2 } }, now);
      const after = await store.counts();
      expect(after.crashes - before.crashes).toBe(1);
      expect(after.usage - before.usage).toBe(1);
    });

    it("purges telemetry received before the cutoff only", async () => {
      const installHash = randomUUID();
      const base = { schema: 1 as const, installHash, rh: "1.0.0", os: "linux-x86_64" as const };
      const crash = { ...base, job: "cli" as const, kind: "panic" as const, where: "a::b:1", frames: ["a::b:1"], at: "2026-01-01T00:00:00.000Z" };
      const before = await store.counts();
      await store.addCrash(crash, later(-10_000));
      await store.addUsage({ ...base, day: "2025-12-31", counts: { searches: 1 } }, later(-10_000));
      await store.addCrash(crash, later(10_000));
      await store.addUsage({ ...base, day: "2026-01-01", counts: { searches: 1 } }, later(10_000));
      await store.purgeTelemetry(now);
      const after = await store.counts();
      expect(after.crashes - before.crashes).toBe(1);
      expect(after.usage - before.usage).toBe(1);
    });

    it("upserts releases and lists by channel and os", async () => {
      await store.addRelease(release, now);
      await store.addRelease({ ...release, signature: "sig2" }, now);
      await store.addRelease({ ...release, channel: "beta", version: "1.1.0-beta.1" }, now);
      const stable = await store.listReleases("stable", "linux-x86_64");
      expect(stable).toEqual([{ ...release, signature: "sig2" }]);
      expect(await store.listReleases("stable", "macos-aarch64")).toEqual([]);
    });
  });
}

contract("memory", async () => new MemoryStore());

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("postgres setup", () => {
  it("applies migrations idempotently", async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    expect((await migrate(pool)).length).toBeGreaterThan(0);
    expect(await migrate(pool)).toEqual([]);
    await pool.end();
  });
});
describe.skipIf(!databaseUrl)("postgres migration 002", () => {
  it("re-keys legacy telemetry, drops raw install ids and is safe to run twice", async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await pool.query(await readFile(new URL("../migrations/001_init.sql", import.meta.url), "utf8"));
    await pool.query("CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    await pool.query("INSERT INTO schema_migrations (name) VALUES ('001_init.sql')");
    const id = "3F1C3C2E-8A3E-4B1B-9D0A-1D6C1F4D9A11";
    const userId = randomUUID();
    await pool.query("INSERT INTO users VALUES ($1, 'a@x.co', now())", [userId]);
    await pool.query("INSERT INTO install_tokens VALUES ('t', $1, $2, now())", [userId, id]);
    await pool.query("INSERT INTO sign_in_requests (id, secret_hash, email, install_id, expires_at) VALUES ('r', 'h', 'a@x.co', $1, now())", [id]);
    await pool.query(
      "INSERT INTO crash_reports (received_at, install_id, rh, os, job, kind, location, frames, occurred_at) VALUES (now(), $1, '1', 'linux-x86_64', 'cli', 'panic', 'a:1', '[]', now())",
      [id],
    );
    await pool.query("INSERT INTO usage_reports VALUES ($1, '2026-01-01', now(), '1', 'linux-x86_64', '{}')", [id]);

    await expect(migrate(pool)).rejects.toThrow(/TELEMETRY_SALT/);
    expect(await migrate(pool, SALT)).toEqual(["002_unlinkable_telemetry.sql"]);
    expect(await migrate(pool, SALT)).toEqual([]);

    const expected = installHash(SALT, id);
    expect((await pool.query("SELECT install_hash FROM crash_reports")).rows).toEqual([{ install_hash: expected }]);
    expect((await pool.query("SELECT install_hash FROM usage_reports")).rows).toEqual([{ install_hash: expected }]);
    const dump = await allRows(pool);
    expect(dump.toLowerCase()).not.toContain(id.toLowerCase());
    await pool.end();
  });
});

describe.skipIf(!databaseUrl)("postgres privacy", () => {
  it("keeps the raw installId out of every column after sign-in and a crash report", async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await migrate(pool);
    const store = new PostgresStore(pool);
    const h = await startHarness(undefined, store);
    const { token } = await h.signIn("a@example.com", INSTALL_ID);
    expect((await h.call("GET", "/v1/account", { token })).status).toBe(200);
    const crash = {
      schema: 1, installId: INSTALL_ID, rh: "0.7.2", os: "linux-x86_64", job: "gateway", kind: "panic",
      where: "a::b:1", frames: ["a::b:1"], at: "2026-01-01T00:00:00.000Z",
    };
    expect((await h.call("POST", "/v1/telemetry/crash", { body: crash })).status).toBe(202);
    const { frames: _f, where: _w, job: _j, kind: _k, at: _a, ...rest } = crash;
    expect((await h.call("POST", "/v1/telemetry/usage", { body: { ...rest, day: "2026-01-01", counts: { searches: 1 } } })).status).toBe(202);
    const dump = await allRows(pool);
    expect(dump.toLowerCase()).not.toContain(INSTALL_ID);
    expect(dump).toContain(installHash(SALT, INSTALL_ID));
    expect(await store.counts()).toMatchObject({ users: 1, crashes: 1, usage: 1 });
    await pool.end();
  });
});

async function allRows(pool: pg.Pool): Promise<string> {
  const tables = await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  const out: unknown[] = [];
  for (const { tablename } of tables.rows) {
    out.push((await pool.query(`SELECT row_to_json(t) AS r FROM "${tablename}" t`)).rows);
  }
  return JSON.stringify(out);
}

if (databaseUrl) contract("postgres", async () => PostgresStore.connect(databaseUrl));
