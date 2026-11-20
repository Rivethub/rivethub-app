/** A summary points into the stored transcript by one-based, inclusive positions. */
export function summaryRangeSearch(section: { sourceFirst?: number; sourceLast?: number } | undefined) {
  const from = section?.sourceFirst;
  const to = section?.sourceLast;
  if (from === undefined || to === undefined || from < 1 || to < from) return undefined;
  return { tab: "transcript", source: "memory", from, to } as const;
}

export function withoutSourceMarkers(text: string): string {
  return text.replace(/^(#{2} .+?) \[m\d+-m\d+\][ \t]*$/gm, "$1");
}

const RANGE = /\s*\[m\d+-m\d+\]\s*$/;

/** A section heading without the transcript range the model wrote after it. */
export function sectionHeading(heading: string): string {
  return heading.replace(RANGE, "").trim();
}

/** The part of a summary passage around the first match, as plain sentences: no Markdown headings and no range markers. */
export function passageExcerpt(text: string, query: string, width = 420): string {
  const plain = withoutSourceMarkers(text)
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= width) return plain;
  const lower = plain.toLowerCase();
  const hits = query.toLowerCase().split(/\s+/).filter((word) => word.length > 1).map((word) => lower.indexOf(word)).filter((at) => at >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  let start = Math.max(0, at - Math.floor(width / 3));
  let end = Math.min(plain.length, start + width);
  start = Math.max(0, end - width);
  if (start > 0) start = plain.indexOf(" ", start) + 1 || start;
  if (end < plain.length) end = plain.lastIndexOf(" ", end) > start ? plain.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "… " : ""}${plain.slice(start, end)}${end < plain.length ? " …" : ""}`;
}
