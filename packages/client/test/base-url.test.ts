import { describe, expect, it } from "vitest";
import { createHttp } from "../src/http.js";

async function requested(baseUrl: string, path = "/api/x"): Promise<string> {
  let seen = "";
  const fetch = async (input: string) => {
    seen = input;
    return new Response(null, { status: 204 });
  };
  await createHttp({ baseUrl, fetch }).send("POST", path);
  return seen;
}

describe("base url", () => {
  it("strips trailing slashes and keeps every slash that is not trailing", async () => {
    expect(await requested("https://rh.test/")).toBe("https://rh.test/api/x");
    expect(await requested("https://rh.test///")).toBe("https://rh.test/api/x");
    expect(await requested("https://rh.test")).toBe("https://rh.test/api/x");
    expect(await requested("https://rh.test/root/")).toBe("https://rh.test/root/api/x");
    expect(await requested("https://rh.test/a/b")).toBe("https://rh.test/a/b/api/x");
    expect(await requested("///")).toBe("/api/x");
  });

  it("finishes a long run of slashes that is not a suffix within a tight bound", async () => {
    const baseUrl = `${"/".repeat(40_000)}x`;
    const started = performance.now();
    expect(await requested(baseUrl, "/p")).toBe(`${baseUrl}/p`);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
