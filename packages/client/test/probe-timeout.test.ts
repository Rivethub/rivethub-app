import { describe, expect, it } from "vitest";
import { createClient } from "../src/compose.js";
import { createRhClient } from "../src/rh/index.js";

const hang = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

describe("capability probe", () => {
  it("treats a route that is slow to answer as present and does not wait for it", async () => {
    const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/today")) return hang(init);
      return Promise.resolve(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
    };
    const started = Date.now();
    const answered = await createRhClient({ baseUrl: "http://hub", fetch }).probe();
    expect(answered.today).toBe("live");
    expect(answered.review).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(6_000);
  }, 10_000);

  it("stops a data request at timeoutMs and serves the sample world", async () => {
    const aborts: number[] = [];
    const fetch = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const started = Date.now();
        init?.signal?.addEventListener("abort", () => {
          aborts.push(Date.now() - started);
          reject(init.signal?.reason);
        });
      });
    const digest = await createClient({ baseUrl: "http://hub", fetch, timeoutMs: 400 }).today();
    expect(digest.freshness).toBe("sample");
    expect(aborts.some((ms) => ms >= 250 && ms < 1_500)).toBe(true);
    expect(aborts.every((ms) => ms < 4_000)).toBe(true);
  }, 10_000);
});
