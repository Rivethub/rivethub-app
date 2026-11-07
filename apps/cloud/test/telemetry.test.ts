import { describe, expect, it } from "vitest";
import { BODY_LIMIT_BYTES } from "../src/app.js";
import { RateLimiter } from "../src/ratelimit.js";
import { INSTALL_ID, relaxedLimits, startHarness } from "./harness.js";

const crash = {
  schema: 1,
  installId: INSTALL_ID,
  rh: "0.7.2",
  os: "linux-x86_64",
  job: "gateway",
  kind: "panic",
  where: "rh_gateway::router::dispatch:218",
  frames: ["rh_gateway::router::dispatch:218", "tokio::runtime::task::poll:44"],
  at: "2026-01-01T00:00:00.000Z",
};
const usage = {
  schema: 1,
  installId: INSTALL_ID,
  rh: "0.7.2",
  os: "linux-x86_64",
  day: "2026-01-01",
  counts: { searches: 4, appOpens: 1 },
};

describe("telemetry", () => {
  it("accepts a valid crash report anonymously", async () => {
    const h = await startHarness();
    expect((await h.call("POST", "/v1/telemetry/crash", { body: crash })).status).toBe(202);
    expect(await h.store.counts()).toMatchObject({ crashes: 1 });
  });

  it("rejects a crash report with an extra field and does not echo the body", async () => {
    const h = await startHarness();
    const res = await h.call("POST", "/v1/telemetry/crash", { body: { ...crash, session: "my private notes" } });
    expect(res.status).toBe(422);
    expect(await res.text()).not.toContain("my private notes");
    expect(await h.store.counts()).toMatchObject({ crashes: 0 });
  });

  it("rejects a frame that carries a file path", async () => {
    const h = await startHarness();
    for (const bad of ["/home/x/project/main.rs:10", "C:\\Users\\x\\a.rs", "src/secret name@x.com"]) {
      const res = await h.call("POST", "/v1/telemetry/crash", { body: { ...crash, frames: [bad] } });
      expect(res.status).toBe(422);
      expect(await res.text()).not.toContain(bad);
    }
    const where = await h.call("POST", "/v1/telemetry/crash", { body: { ...crash, where: "/home/x" } });
    expect(where.status).toBe(422);
    expect(await h.store.counts()).toMatchObject({ crashes: 0 });
  });

  it("rejects malformed JSON, wrong types and unknown enums with 422", async () => {
    const h = await startHarness();
    expect((await h.call("POST", "/v1/telemetry/crash", { raw: "{not json" })).status).toBe(422);
    expect((await h.call("POST", "/v1/telemetry/crash", { body: [] })).status).toBe(422);
    expect((await h.call("POST", "/v1/telemetry/crash", { body: { ...crash, os: "plan9" } })).status).toBe(422);
    expect((await h.call("POST", "/v1/telemetry/crash", { body: { ...crash, installId: "not-a-uuid" } })).status).toBe(422);
  });

  it("accepts a usage report and keeps one row per install and day", async () => {
    const h = await startHarness();
    expect((await h.call("POST", "/v1/telemetry/usage", { body: usage })).status).toBe(202);
    expect((await h.call("POST", "/v1/telemetry/usage", { body: { ...usage, counts: { searches: 9 } } })).status).toBe(202);
    expect((await h.call("POST", "/v1/telemetry/usage", { body: { ...usage, day: "2026-01-02" } })).status).toBe(202);
    expect(await h.store.counts()).toMatchObject({ usage: 2 });
  });

  it("rejects usage reports with extra fields or unknown counters", async () => {
    const h = await startHarness();
    expect((await h.call("POST", "/v1/telemetry/usage", { body: { ...usage, email: "a@b.co" } })).status).toBe(422);
    expect((await h.call("POST", "/v1/telemetry/usage", { body: { ...usage, counts: { searchText: 1 } } })).status).toBe(422);
    expect((await h.call("POST", "/v1/telemetry/usage", { body: { ...usage, counts: { searches: -1 } } })).status).toBe(422);
  });

  it("caps the body at 32 KB", async () => {
    const h = await startHarness();
    const res = await h.call("POST", "/v1/telemetry/crash", { raw: JSON.stringify({ ...crash, pad: "x".repeat(BODY_LIMIT_BYTES) }) });
    expect(res.status).toBe(413);
    expect(await h.store.counts()).toMatchObject({ crashes: 0 });
  });

  it("limits per installId and IP, not across installs", async () => {
    const h = await startHarness(relaxedLimits({ telemetryInstall: new RateLimiter(2, 60_000) }));
    expect((await h.call("POST", "/v1/telemetry/crash", { body: crash })).status).toBe(202);
    expect((await h.call("POST", "/v1/telemetry/crash", { body: crash })).status).toBe(202);
    const limited = await h.call("POST", "/v1/telemetry/crash", { body: crash });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    const other = { ...crash, installId: "7a1c3c2e-8a3e-4b1b-9d0a-1d6c1f4d9a22" };
    expect((await h.call("POST", "/v1/telemetry/crash", { body: other })).status).toBe(202);
  });

  it("applies a coarse per-IP limit before parsing", async () => {
    const h = await startHarness(relaxedLimits({ telemetryIp: new RateLimiter(1, 60_000) }));
    expect((await h.call("POST", "/v1/telemetry/usage", { raw: "junk" })).status).toBe(422);
    expect((await h.call("POST", "/v1/telemetry/usage", { raw: "junk" })).status).toBe(429);
  });
});
