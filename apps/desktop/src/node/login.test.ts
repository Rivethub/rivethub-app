import { describe, expect, it } from "vitest";

import { signedInUrl } from "./login";

describe("signedInUrl", () => {
  const node = new URL("http://127.0.0.1:5174/review?x=1");

  it("opens the node URL when there is no code", () => {
    expect(signedInUrl(node, null)).toBe("http://127.0.0.1:5174/review?x=1");
  });

  it("carries a code in the /login fragment, never the query", () => {
    const url = new URL(signedInUrl(node, "abc-_123"));
    expect(url.pathname).toBe("/login");
    expect(url.search).toBe("");
    expect(url.hash).toBe("#code=abc-_123");
  });
});
