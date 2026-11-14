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

// Inline: code first (nothing inside it is markup), then links, bold, emphasis.
const INLINE = /(`+)([^`]+?)\1|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\s][^*]*?)\*|(?<![\w/])_([^_\s][^_]*?)_(?![\w/])/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (m.index > 0) out.push({ kind: "text", text: rest.slice(0, m.index) });
    if (m[2] !== undefined) out.push({ kind: "code", text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "link", href: m[4]!, children: parseInline(m[3]) });
    else if (m[5] !== undefined || m[6] !== undefined) out.push({ kind: "strong", children: parseInline((m[5] ?? m[6])!) });
    else out.push({ kind: "em", children: parseInline((m[7] ?? m[8])!) });
    rest = rest.slice(m.index + m[0].length);
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
