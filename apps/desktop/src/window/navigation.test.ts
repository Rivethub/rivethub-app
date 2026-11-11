import { describe, expect, it } from "vitest";

import { isSameOrigin, parseExternalUrl } from "./navigation";

describe("isSameOrigin", () => {
  const origin = "http://127.0.0.1:5174";

  it("allows any path on the node's origin", () => {
    expect(isSameOrigin(origin, "http://127.0.0.1:5174/sessions/a?b#c")).toBe(true);
  });

  it.each(["http://127.0.0.1:5175/", "https://127.0.0.1:5174/", "http://localhost:5174/", "https://example.com/", "file:///etc/passwd", "not a url"])(
    "refuses %s",
    (url) => expect(isSameOrigin(origin, url)).toBe(false),
  );
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
