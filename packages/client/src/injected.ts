export type TurnText = { kind: "said"; text: string } | { kind: "injected"; tag: string; text: string };

const BLOCK = /^<([a-z][a-z0-9]*(?:[_-][a-z0-9]+)+|system-reminder)>\n?([\s\S]*?)\n?<\/\1>[ \t]*$/gm;
const SAID = new Set(["user_request", "user_query", "user_message"]);

export function splitInjected(input: string): TurnText[] {
  const out: TurnText[] = [];
  const said = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) out.push({ kind: "said", text: trimmed });
  };
  let last = 0;
  for (const match of input.matchAll(BLOCK)) {
    const [whole, tag = "", body = ""] = match;
    said(input.slice(last, match.index));
    if (SAID.has(tag)) said(body);
    else out.push({ kind: "injected", tag, text: body.trim() });
    last = match.index + whole.length;
  }
  said(input.slice(last));
  return out;
}
