import { describe, expect, it } from "vitest";
import { stampIndexHtml, versionDocument } from "./web-version";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>RivetHub</title>
  </head>
  <body><div id="root"></div></body>
</html>
`;

describe("stampIndexHtml", () => {
  it("writes the release version and the commit, and a second stamp replaces the first", () => {
    const once = stampIndexHtml(HTML, "0.8.2", "0123456789abcdef0123456789abcdef01234567");
    expect(once).toContain('<meta name="rivethub-web-version" content="0.8.2" />');
    expect(once).toContain('<meta name="rivethub-web-commit" content="0123456789abcdef0123456789abcdef01234567" />');
    const twice = stampIndexHtml(once, "0.8.2-nightly.20261119.4", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(twice.match(/rivethub-web-version/g)).toHaveLength(1);
    expect(twice).toContain('content="0.8.2-nightly.20261119.4"');
    expect(twice).not.toContain('content="0.8.2"');
  });
});

describe("versionDocument", () => {
  it("is the same version and commit, as JSON", () => {
    expect(JSON.parse(versionDocument("0.8.2-nightly.20261119.4", "abc"))).toEqual({
      version: "0.8.2-nightly.20261119.4",
      commit: "abc",
    });
  });
});
