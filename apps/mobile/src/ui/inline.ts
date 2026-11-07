export type Span = { kind: "text" | "code" | "strong"; text: string };

const TOKEN = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;

export function inlineSpans(input: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of input.matchAll(TOKEN)) {
    const at = match.index;
    if (at > last) spans.push({ kind: "text", text: input.slice(last, at) });
    if (match[1] !== undefined) spans.push({ kind: "code", text: match[1] });
    else if (match[2] !== undefined) spans.push({ kind: "strong", text: match[2] });
    last = at + match[0].length;
  }
  if (last < input.length) spans.push({ kind: "text", text: input.slice(last) });
  return spans;
}
