import { randomUUID } from "node:crypto";
import type { CrashReport, UsageReport } from "@rivethub/contracts";
import type { Channel, NewSignIn, Release, Session, SignInOutcome, Store } from "./types.js";

interface SignInRow extends NewSignIn {
  verified: boolean;
  consumed: boolean;
}

interface TokenRow extends Session {
  tokenHash: string;
}

export class MemoryStore implements Store {
  private readonly users = new Map<string, string>();
  private readonly signIns = new Map<string, SignInRow>();
  private readonly tokens = new Map<string, TokenRow>();
  private readonly crashes: CrashReport[] = [];
  private readonly usage = new Map<string, UsageReport>();
  private readonly releases: Release[] = [];

  async createSignIn(request: NewSignIn): Promise<void> {
    this.signIns.set(request.id, { ...request, verified: false, consumed: false });
  }

  async verifySignIn(id: string, secretHash: string, now: Date): Promise<boolean> {
    const row = this.signIns.get(id);
    if (!row || row.secretHash !== secretHash || row.verified || row.expiresAt <= now) return false;
    row.verified = true;
    return true;
  }

  async completeSignIn(id: string, tokenHash: string, now: Date): Promise<SignInOutcome> {
    const row = this.signIns.get(id);
    if (!row || row.consumed || row.expiresAt <= now) return { kind: "expired" };
    if (!row.verified) return { kind: "pending" };
    row.consumed = true;
    let userId = [...this.users].find(([, email]) => email === row.email)?.[0];
    if (!userId) {
      userId = randomUUID();
      this.users.set(userId, row.email);
    }
    this.tokens.set(tokenHash, { tokenHash, userId, email: row.email, installId: row.installId });
    return { kind: "signedIn", email: row.email };
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const row = this.tokens.get(tokenHash);
    return row ? { userId: row.userId, email: row.email, installId: row.installId } : null;
  }

  async revokeToken(tokenHash: string): Promise<void> {
    this.tokens.delete(tokenHash);
  }

  async deleteUser(userId: string): Promise<void> {
    const email = this.users.get(userId);
    this.users.delete(userId);
    for (const [hash, t] of this.tokens) if (t.userId === userId) this.tokens.delete(hash);
    for (const [id, s] of this.signIns) if (s.email === email) this.signIns.delete(id);
  }

  async addCrash(report: CrashReport, _receivedAt: Date): Promise<void> {
    this.crashes.push(report);
  }

  async addUsage(report: UsageReport, _receivedAt: Date): Promise<void> {
    this.usage.set(`${report.installId}/${report.day}`, report);
  }

  async addRelease(release: Release, _createdAt: Date): Promise<void> {
    const i = this.releases.findIndex(
      (r) => r.channel === release.channel && r.os === release.os && r.version === release.version,
    );
    if (i >= 0) this.releases[i] = release;
    else this.releases.push(release);
  }

  async listReleases(channel: Channel, os: Release["os"]): Promise<Release[]> {
    return this.releases.filter((r) => r.channel === channel && r.os === os);
  }

  async purgeExpired(now: Date): Promise<void> {
    for (const [id, s] of this.signIns) if (s.expiresAt <= now) this.signIns.delete(id);
  }

  async counts(): Promise<{ users: number; crashes: number; usage: number }> {
    return { users: this.users.size, crashes: this.crashes.length, usage: this.usage.size };
  }

  async close(): Promise<void> {}

  /** Test helper: emails still held in sign-in requests. */
  signInEmails(): string[] {
    return [...this.signIns.values()].map((s) => s.email);
  }
}
