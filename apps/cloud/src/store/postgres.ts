import { randomUUID } from "node:crypto";
import type { CrashReport, UsageReport } from "@rivethub/contracts";
import pg from "pg";
import type { Channel, NewSignIn, Release, Session, SignInOutcome, Store, Stored } from "./types.js";

export class PostgresStore implements Store {
  constructor(readonly pool: pg.Pool) {}

  static connect(databaseUrl: string): PostgresStore {
    return new PostgresStore(new pg.Pool({ connectionString: databaseUrl, max: 10 }));
  }

  async createSignIn(r: NewSignIn): Promise<void> {
    await this.pool.query(
      "INSERT INTO sign_in_requests (id, secret_hash, email, expires_at) VALUES ($1, $2, $3, $4)",
      [r.id, r.secretHash, r.email, r.expiresAt],
    );
  }

  async verifySignIn(id: string, secretHash: string, now: Date): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE sign_in_requests SET verified_at = $3
       WHERE id = $1 AND secret_hash = $2 AND verified_at IS NULL AND expires_at > $3`,
      [id, secretHash, now],
    );
    return res.rowCount === 1;
  }

  async completeSignIn(id: string, tokenHash: string, now: Date): Promise<SignInOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query<{ email: string }>(
        `UPDATE sign_in_requests SET consumed_at = $2
         WHERE id = $1 AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at > $2
         RETURNING email`,
        [id, now],
      );
      const row = claimed.rows[0];
      if (!row) {
        const state = await client.query(
          "SELECT 1 FROM sign_in_requests WHERE id = $1 AND verified_at IS NULL AND consumed_at IS NULL AND expires_at > $2",
          [id, now],
        );
        await client.query("COMMIT");
        return state.rowCount === 1 ? { kind: "pending" } : { kind: "expired" };
      }
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (id, email, created_at) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
        [randomUUID(), row.email, now],
      );
      await client.query(
        "INSERT INTO install_tokens (token_hash, user_id, created_at) VALUES ($1, $2, $3)",
        [tokenHash, user.rows[0]!.id, now],
      );
      await client.query("COMMIT");
      return { kind: "signedIn", email: row.email };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const res = await this.pool.query<{ user_id: string; email: string }>(
      `SELECT t.user_id, u.email FROM install_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1`,
      [tokenHash],
    );
    const row = res.rows[0];
    return row ? { userId: row.user_id, email: row.email } : null;
  }

  async revokeToken(tokenHash: string): Promise<void> {
    await this.pool.query("DELETE FROM install_tokens WHERE token_hash = $1", [tokenHash]);
  }

  async deleteUser(userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query<{ email: string }>("DELETE FROM users WHERE id = $1 RETURNING email", [userId]);
      const email = res.rows[0]?.email;
      if (email) await client.query("DELETE FROM sign_in_requests WHERE email = $1", [email]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async addCrash(r: Stored<CrashReport>, receivedAt: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO crash_reports (received_at, install_hash, rh, os, job, kind, location, frames, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [receivedAt, r.installHash, r.rh, r.os, r.job, r.kind, r.where, JSON.stringify(r.frames), r.at],
    );
  }

  async addUsage(r: Stored<UsageReport>, receivedAt: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO usage_reports (install_hash, day, received_at, rh, os, counts) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (install_hash, day) DO UPDATE
       SET received_at = EXCLUDED.received_at, rh = EXCLUDED.rh, os = EXCLUDED.os, counts = EXCLUDED.counts`,
      [r.installHash, r.day, receivedAt, r.rh, r.os, JSON.stringify(r.counts)],
    );
  }

  async addRelease(r: Release, createdAt: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO releases (channel, os, version, url, sha256, signature, notes_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (channel, os, version) DO UPDATE
       SET url = EXCLUDED.url, sha256 = EXCLUDED.sha256, signature = EXCLUDED.signature, notes_url = EXCLUDED.notes_url`,
      [r.channel, r.os, r.version, r.url, r.sha256, r.signature, r.notesUrl, createdAt],
    );
  }

  async listReleases(channel: Channel, os: Release["os"]): Promise<Release[]> {
    const res = await this.pool.query<{
      channel: Channel;
      os: Release["os"];
      version: string;
      url: string;
      sha256: string;
      signature: string;
      notes_url: string;
    }>("SELECT channel, os, version, url, sha256, signature, notes_url FROM releases WHERE channel = $1 AND os = $2", [
      channel,
      os,
    ]);
    return res.rows.map((r) => ({
      channel: r.channel,
      os: r.os,
      version: r.version,
      url: r.url,
      sha256: r.sha256,
      signature: r.signature,
      notesUrl: r.notes_url,
    }));
  }

  async purgeExpired(now: Date): Promise<void> {
    await this.pool.query("DELETE FROM sign_in_requests WHERE expires_at <= $1", [now]);
  }

  async purgeTelemetry(cutoff: Date): Promise<void> {
    await this.pool.query("DELETE FROM crash_reports WHERE received_at < $1", [cutoff]);
    await this.pool.query("DELETE FROM usage_reports WHERE received_at < $1", [cutoff]);
  }

  async counts(): Promise<{ users: number; crashes: number; usage: number }> {
    const res = await this.pool.query<{ users: string; crashes: string; usage: string }>(
      `SELECT (SELECT count(*) FROM users) AS users,
              (SELECT count(*) FROM crash_reports) AS crashes,
              (SELECT count(*) FROM usage_reports) AS usage`,
    );
    const r = res.rows[0]!;
    return { users: Number(r.users), crashes: Number(r.crashes), usage: Number(r.usage) };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
