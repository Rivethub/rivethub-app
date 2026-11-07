import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/store/migrate.js";
import { MemoryStore } from "../src/store/memory.js";
import { PostgresStore } from "../src/store/postgres.js";
import type { Release, Store } from "../src/store/types.js";

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
      store.createSignIn({ id, secretHash: `h-${id}`, email, installId: randomUUID(), expiresAt: later(ttl) });

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
      const installId = randomUUID();
      const crash = {
        schema: 1 as const,
        installId,
        rh: "1.0.0",
        os: "linux-x86_64" as const,
        job: "cli" as const,
        kind: "panic" as const,
        where: "a::b:1",
        frames: ["a::b:1"],
        at: "2026-01-01T00:00:00.000Z",
      };
      await store.addCrash(crash, now);
      const usage = { schema: 1 as const, installId, rh: "1.0.0", os: "linux-x86_64" as const, day: "2026-01-01", counts: { searches: 1 } };
      await store.addUsage(usage, now);
      await store.addUsage({ ...usage, counts: { searches: 2 } }, now);
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
if (databaseUrl) contract("postgres", async () => PostgresStore.connect(databaseUrl));
