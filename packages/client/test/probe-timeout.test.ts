import { describe, expect, it } from "vitest";
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
});
