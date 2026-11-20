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
