import { describe, expect, it } from "vitest";

import { ACTIVATION_MS, createUserActivation, isNodeUrl, parseExternalUrl } from "./navigation";

describe("isNodeUrl", () => {
  const origin = "http://127.0.0.1:5174";

  it("allows any path on the node's origin", () => {
    expect(isNodeUrl(origin, "http://127.0.0.1:5174/sessions/a?b#c")).toBe(true);
  });

  it.each([
    "http://127.0.0.1:5175/",
    "https://127.0.0.1:5174/",
    "http://localhost:5174/",
    "https://example.com/",
    "file:///etc/passwd",
    "blob:http://127.0.0.1:5174/0b0e3b6a-3f0e-4f43-9d55-6e1f8f3c2a11",
    "about:blank",
    "not a url",
  ])("refuses %s", (url) => expect(isNodeUrl(origin, url)).toBe(false));
});

describe("parseExternalUrl", () => {
  it("hands web and mail links to the OS", () => {
    expect(parseExternalUrl("https://rivethub.io/docs")).toBe("https://rivethub.io/docs");
    expect(parseExternalUrl("mailto:hi@rivethub.io")).toBe("mailto:hi@rivethub.io");
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "smb://share/x", "rivethub://pair", "nope"])("refuses %s", (url) =>
    expect(parseExternalUrl(url)).toBeNull(),
  );
});

describe("createUserActivation", () => {
  const clock = () => {
    let t = 10_000;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  };

  it("is inactive with no input, and after pointer moves or scrolls", () => {
    const c = clock();
    const activation = createUserActivation(c.now);
    expect(activation.consume()).toBe(false);
    activation.note("mouseMove");
    activation.note("mouseWheel");
    expect(activation.consume()).toBe(false);
  });

  it("lets one link out right after a click", () => {
    const c = clock();
    const activation = createUserActivation(c.now);
    activation.note("mouseUp");
    c.advance(ACTIVATION_MS - 1);
    expect(activation.consume()).toBe(true);
    expect(activation.consume()).toBe(false);
  });

  it("expires", () => {
    const c = clock();
    const activation = createUserActivation(c.now);
    activation.note("rawKeyDown");
    c.advance(ACTIVATION_MS);
    expect(activation.consume()).toBe(false);
  });
});
