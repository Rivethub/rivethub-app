/**
 * The Markdown the memory workers write into topic and entity pages.
 * Pure: headings, paragraphs, lists (nested by indent), fenced code,
 * quotes, rules, tables, and inline code, links, bold and emphasis.
 * Renderers turn these blocks into elements. Nothing here reads as HTML.
 */

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "list"; ordered: boolean; items: Item[] }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface Item {
  text: string;
  children: Block[];
}

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] };

const BULLET = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const ROW = /^\s*\|.*\|\s*$/;
const DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const indentOf = (line: string) => /^\s*/.exec(line)![0].replace(/\t/g, "  ").length;

function parseList(lines: string[], start: number, base: number): { block: Block; next: number } {
  const first = BULLET.exec(lines[start]!)!;
  const ordered = /\d/.test(first[2]!);
  const items: Item[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    const m = BULLET.exec(line);
    if (m && indentOf(line) === base) {
      items.push({ text: m[3]!, children: [] });
      i += 1;
    } else if (m && indentOf(line) > base && items.length > 0) {
      const nested = parseList(lines, i, indentOf(line));
      items.at(-1)!.children.push(nested.block);
      i = nested.next;
    } else if (line.trim() !== "" && indentOf(line) > base && items.length > 0 && !m) {
      items.at(-1)!.text += ` ${line.trim()}`;
      i += 1;
    } else break;
  }
  return { block: { kind: "list", ordered, items }, next: i };
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i]!)) body.push(lines[i++]!);
      i += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
      i += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }
    if (ROW.test(line) && i + 1 < lines.length && DIVIDER.test(lines[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && ROW.test(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    if (BULLET.test(line)) {
      const list = parseList(lines, i, indentOf(line));
      blocks.push(list.block);
      i = list.next;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "quote", text: body.join(" ") });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !HEADING.test(lines[i]!) && !FENCE.test(lines[i]!) && !BULLET.test(lines[i]!) && !/^\s*>/.test(lines[i]!) && !RULE.test(lines[i]!)) {
      body.push(lines[i++]!.trim());
    }
    blocks.push({ kind: "paragraph", text: body.join(" ") });
  }
  return blocks;
}

// Inline markers, in the order a combined expression would try them.
// A scan, because that expression backtracks on a long run of one character.
const isSpace = (char: string) => char.trim() === "";
const isWord = (char: string) => {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === "_";
};

interface Span {
  start: number;
  end: number;
  node: Exclude<Inline, { kind: "text" }>;
}

function scanCode(text: string, i: number): { skipTo: number } | { start: number; end: number; text: string } {
  let runEnd = i;
  while (runEnd < text.length && text[runEnd] === "`") runEnd += 1;
  const open = runEnd - i;
  let contentEnd = runEnd;
  while (contentEnd < text.length && text[contentEnd] !== "`") contentEnd += 1;
  if (contentEnd === runEnd) return { skipTo: runEnd };
  let closeEnd = contentEnd;
  while (closeEnd < text.length && text[closeEnd] === "`") closeEnd += 1;
  const close = closeEnd - contentEnd;
  if (close === 0) return { skipTo: runEnd };
  const taken = Math.min(open, close);
  return { start: runEnd - taken, end: contentEnd + taken, text: text.slice(runEnd, contentEnd) };
}

function scanLink(text: string, i: number): { dead?: boolean; skipTo?: number; start?: number; end?: number; label?: string; href?: string } {
  const bracket = text.indexOf("]", i + 1);
  if (bracket < 0) return { dead: true };
  if (bracket === i + 1 || text[bracket + 1] !== "(") return { skipTo: bracket + 1 };
  let cursor = bracket + 2;
  const hrefStart = cursor;
  while (cursor < text.length && text[cursor] !== ")" && !isSpace(text[cursor]!)) cursor += 1;
  if (cursor === hrefStart || text[cursor] !== ")") return cursor >= text.length ? { dead: true } : { skipTo: bracket + 1 };
  return { start: i, end: cursor + 1, label: text.slice(i + 1, bracket), href: text.slice(hrefStart, cursor) };
}

function scanStars(text: string, i: number): { skipTo: number } | { start: number; end: number; kind: "strong" | "em"; text: string } {
  if (text[i + 1] === "*") {
    const contentStart = i + 2;
    if (contentStart < text.length && text[contentStart] !== "*") {
      let cursor = contentStart;
      while (cursor < text.length && text[cursor] !== "*") cursor += 1;
      if (text[cursor] === "*" && text[cursor + 1] === "*" && cursor > contentStart) {
        return { start: i, end: cursor + 2, kind: "strong", text: text.slice(contentStart, cursor) };
      }
    }
  }
  const contentStart = i + 1;
  if (contentStart >= text.length || text[contentStart] === "*" || isSpace(text[contentStart]!)) return { skipTo: i + 1 };
  let cursor = contentStart + 1;
  while (cursor < text.length && text[cursor] !== "*") cursor += 1;
  if (cursor >= text.length) return { skipTo: i + 1 };
  return { start: i, end: cursor + 1, kind: "em", text: text.slice(contentStart, cursor) };
}

function scanUnder(text: string, i: number, from: number): { skipTo: number } | { start: number; end: number; kind: "strong" | "em"; text: string } {
  if (text[i + 1] === "_") {
    const contentStart = i + 2;
    if (contentStart < text.length && text[contentStart] !== "_") {
      let cursor = contentStart;
      while (cursor < text.length && text[cursor] !== "_") cursor += 1;
      if (text[cursor] === "_" && text[cursor + 1] === "_" && cursor > contentStart) {
        return { start: i, end: cursor + 2, kind: "strong", text: text.slice(contentStart, cursor) };
      }
    }
  }
  if (i > from && (text[i - 1] === "/" || isWord(text[i - 1]!))) return { skipTo: i + 1 };
  const contentStart = i + 1;
  if (contentStart >= text.length || text[contentStart] === "_" || isSpace(text[contentStart]!)) return { skipTo: i + 1 };
  let cursor = contentStart + 1;
  while (cursor < text.length && text[cursor] !== "_") cursor += 1;
  if (cursor >= text.length) return { skipTo: i + 1 };
  const after = text[cursor + 1];
  if (after !== undefined && (after === "/" || isWord(after))) return { skipTo: i + 1 };
  return { start: i, end: cursor + 1, kind: "em", text: text.slice(contentStart, cursor) };
}

function findInline(text: string, from: number): Span | undefined {
  let i = from;
  let linkDead = false;
  let nextLinkAt = from;
  while (i < text.length) {
    const char = text[i];
    if (char === "`") {
      const found = scanCode(text, i);
      if ("text" in found && found.start >= i) return { start: found.start, end: found.end, node: { kind: "code", text: found.text } };
      i = "skipTo" in found && found.skipTo > i ? found.skipTo : i + 1;
      continue;
    }
    if (char === "[" && !linkDead && i >= nextLinkAt) {
      const found = scanLink(text, i);
      if (found.label !== undefined && found.href !== undefined && found.start !== undefined && found.end !== undefined) {
        return { start: found.start, end: found.end, node: { kind: "link", href: found.href, children: parseInline(found.label) } };
      }
      if (found.dead) linkDead = true;
      if (found.skipTo !== undefined && found.skipTo > i) nextLinkAt = found.skipTo;
      i += 1;
      continue;
    }
    if (char === "*") {
      const found = scanStars(text, i);
      if ("kind" in found) return { start: found.start, end: found.end, node: { kind: found.kind, children: parseInline(found.text) } };
      i = found.skipTo > i ? found.skipTo : i + 1;
      continue;
    }
    if (char === "_") {
      const found = scanUnder(text, i, from);
      if ("kind" in found) return { start: found.start, end: found.end, node: { kind: found.kind, children: parseInline(found.text) } };
      i = found.skipTo > i ? found.skipTo : i + 1;
      continue;
    }
    i += 1;
  }
  return undefined;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < text.length) {
    const found = findInline(text, i);
    if (!found) {
      out.push({ kind: "text", text: text.slice(i) });
      break;
    }
    if (found.start > i) out.push({ kind: "text", text: text.slice(i, found.start) });
    out.push(found.node);
    i = found.end;
  }
  return out;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A page's article as it should read under that page's own title and facts:
 * without a first heading that repeats the title, and without the "Current
 * facts" list the entity worker appends when the facts themselves are shown.
 */
export function articleBody(article: string, title: string, options: { dropFacts?: boolean; dropLead?: string } = {}): string {
  let lines = article.replace(/\r\n?/g, "\n").split("\n");
  const firstText = lines.findIndex((l) => l.trim() !== "");
  const heading = firstText >= 0 ? HEADING.exec(lines[firstText]!) : null;
  if (heading && same(heading[2]!, title)) lines = lines.slice(firstText + 1);
  if (options.dropFacts) {
    const at = lines.findIndex((l) => {
      const h = HEADING.exec(l);
      return !!h && same(h[2]!, "Current facts");
    });
    if (at >= 0) {
      const level = HEADING.exec(lines[at]!)![1]!.length;
      let end = at + 1;
      while (end < lines.length) {
        const h = HEADING.exec(lines[end]!);
        if (h && h[1]!.length <= level) break;
        end += 1;
      }
      lines = [...lines.slice(0, at), ...lines.slice(end)];
    }
  }
  let body = lines.join("\n").trim();
  if (options.dropLead && body.startsWith(options.dropLead.trim())) body = body.slice(options.dropLead.trim().length).trim();
  return body;
}
