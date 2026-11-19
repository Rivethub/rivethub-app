import { describe, expect, it } from "vitest";

import { DEFAULT_NODE_URL, parseNodeUrl } from "./nodeUrl";

describe("parseNodeUrl", () => {
  it("defaults to rh's local address", () => {
    expect(parseNodeUrl(undefined).href).toBe(DEFAULT_NODE_URL);
    expect(parseNodeUrl("  ").href).toBe(DEFAULT_NODE_URL);
  });

  it("accepts loopback http and https and drops any fragment", () => {
    expect(parseNodeUrl("http://127.0.0.1:5733/?sample#x").href).toBe("http://127.0.0.1:5733/?sample");
    expect(parseNodeUrl("https://localhost:5174").origin).toBe("https://localhost:5174");
    expect(parseNodeUrl("http://[::1]:5174/").origin).toBe("http://[::1]:5174");
  });

  it.each([
    ["http://192.0.2.10:5174/", /loopback/],
    ["http://127.0.0.1.example.com/", /loopback/],
    ["file:///tmp/index.html", /http or https/],
    ["http://user:pw@127.0.0.1:5174/", /credentials/],
  ])("refuses %s", (raw, message) => {
    expect(() => parseNodeUrl(raw)).toThrow(message);
  });
});
