export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  hit(key: string, now: number): LimitResult {
    let bucket = this.buckets.get(key);
    if (bucket && now >= bucket.resetAt) {
      this.buckets.delete(key);
      bucket = undefined;
    }
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) this.prune(now);
      if (this.buckets.size >= this.maxKeys) return { ok: false, retryAfterSec: 1 };
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { ok: true };
    }
    if (bucket.count >= this.limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    bucket.count += 1;
    return { ok: true };
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) if (now >= bucket.resetAt) this.buckets.delete(key);
  }
}

export interface Limits {
  authEmail: RateLimiter;
  authIp: RateLimiter;
  pollIp: RateLimiter;
  telemetryIp: RateLimiter;
  telemetryInstall: RateLimiter;
}

const MIN = 60_000;

export function defaultLimits(): Limits {
  return {
    authEmail: new RateLimiter(5, 60 * MIN),
    authIp: new RateLimiter(10, MIN),
    pollIp: new RateLimiter(120, MIN),
    telemetryIp: new RateLimiter(120, MIN),
    telemetryInstall: new RateLimiter(20, MIN),
  };
}
