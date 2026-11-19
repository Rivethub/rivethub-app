const VERSION_META = "rivethub-web-version";
const COMMIT_META = "rivethub-web-commit";

function assertToken(value: string, name: string): void {
  if (value === "" || /[\r\n"<>]/.test(value)) throw new Error(`${name} cannot be written into the version meta`);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Inserts the version and commit metas, replacing any earlier pair so a packager can restamp a dist. */
export function stampIndexHtml(html: string, version: string, commit: string): string {
  assertToken(version, "version");
  assertToken(commit, "commit");
  const stripped = html
    .replace(/<meta name="rivethub-web-version" [^>]*>\s*/g, "")
    .replace(/<meta name="rivethub-web-commit" [^>]*>\s*/g, "");
  const head = stripped.indexOf("</head>");
  if (head === -1) throw new Error("index.html has no </head>");
  const meta = `    <meta name="${VERSION_META}" content="${escapeAttr(version)}" />\n    <meta name="${COMMIT_META}" content="${escapeAttr(commit)}" />\n`;
  return `${stripped.slice(0, head)}${meta}${stripped.slice(head)}`;
}

export function versionDocument(version: string, commit: string): string {
  assertToken(version, "version");
  assertToken(commit, "commit");
  return `${JSON.stringify({ version, commit })}\n`;
}
