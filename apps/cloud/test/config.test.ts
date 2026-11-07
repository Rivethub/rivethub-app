import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { DATABASE_URL: "postgres://x" };

describe("telemetry config", () => {
  it("generates a per-process salt in dev and flags it", () => {
    const a = loadConfig(base);
    const b = loadConfig(base);
    expect(a.telemetrySaltGenerated).toBe(true);
    expect(a.telemetrySalt).not.toBe(b.telemetrySalt);
    expect(a.telemetryRetentionDays).toBe(90);
  });

  it("requires TELEMETRY_SALT in production or when mail is real", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/TELEMETRY_SALT/);
    expect(() => loadConfig({ ...base, RESEND_API_KEY: "re_x" })).toThrow(/TELEMETRY_SALT/);
    const ok = loadConfig({ ...base, NODE_ENV: "production", TELEMETRY_SALT: "s".repeat(32), TELEMETRY_RETENTION_DAYS: "30" });
    expect(ok.telemetrySaltGenerated).toBe(false);
    expect(ok.telemetryRetentionDays).toBe(30);
  });

  it("rejects a short salt", () => {
    expect(() => loadConfig({ ...base, TELEMETRY_SALT: "short" })).toThrow();
  });
});
