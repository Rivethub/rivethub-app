import { Fragment, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * Renders the Markdown the memory workers write into topic and entity pages:
 * headings, paragraphs, lists (nested by indent), fenced and inline code,
 * bold, emphasis, links, quotes, rules and simple tables. It builds React
 * elements and never sets HTML, so page text cannot inject markup.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "list"; ordered: boolean; items: Item[] }
  | { kind: "table"; head: string[]; rows: string[][] };

interface Item {
  text: string;
  children: Block[];
}

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
      // A wrapped line belongs to the item above it.
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

function inline(text: string, key = ""): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const k = `${key}${n++}`;
    if (m[2] !== undefined) out.push(<code key={k} className="rounded bg-code px-1 py-px font-mono text-[0.86em] break-words">{m[2]}</code>);
    else if (m[3] !== undefined) {
      const href = m[4]!;
      const label = inline(m[3], `${k}-`);
      if (/^https?:\/\//i.test(href)) out.push(<a key={k} href={href} target="_blank" rel="noreferrer noopener">{label}</a>);
      else if (href.startsWith("/")) out.push(<a key={k} href={href}>{label}</a>);
      else out.push(<Fragment key={k}>{label}</Fragment>);
    } else if (m[5] !== undefined || m[6] !== undefined) out.push(<strong key={k} className="font-semibold text-foreground">{inline((m[5] ?? m[6])!, `${k}-`)}</strong>);
    else out.push(<em key={k}>{inline((m[7] ?? m[8])!, `${k}-`)}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case "heading": {
      // The page title is the h1, so article headings start at h2.
      const level = Math.min(Math.max(block.level, 2), 4);
      const cls = level === 2 ? "mt-4 mb-0 border-b border-border pb-1 text-[20px] font-semibold" : level === 3 ? "mt-3 mb-0 text-[17px] font-semibold" : "mt-2 mb-0 text-[15px] font-semibold";
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      return <Tag key={key} className={cls}>{inline(block.text)}</Tag>;
    }
    case "paragraph":
      return <p key={key} className="m-0">{inline(block.text)}</p>;
    case "code":
      return <pre key={key} tabIndex={0} className="m-0 overflow-x-auto rounded-lg bg-code p-3 font-mono text-[13px] leading-[1.5]"><code>{block.text}</code></pre>;
    case "quote":
      return <blockquote key={key} className="m-0 border-l-2 border-input pl-3 text-muted-foreground">{inline(block.text)}</blockquote>;
    case "rule":
      return <hr key={key} className="m-0 border-0 border-t border-border" />;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={key} className={cx("m-0 flex flex-col gap-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, i) => (
            <li key={i} className="pl-0.5 marker:text-muted-foreground">
              {inline(item.text)}
              {item.children.length > 0 && <div className="mt-1.5 flex flex-col gap-1.5">{item.children.map(renderBlock)}</div>}
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse font-sans text-[14px]">
            <thead>
              <tr>{block.head.map((h, i) => <th key={i} scope="col" className="border-b border-input px-2 py-1.5 text-left font-semibold">{inline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>{row.map((c, i) => <td key={i} className="border-b border-border px-2 py-1.5 align-top">{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={cx("flex flex-col gap-3", className)}>{parseMarkdown(source).map(renderBlock)}</div>;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A page's article as it should read under that page's own title and facts:
 * without a first heading that repeats the title, and without the "Current
 * facts" list the entity worker appends when the facts are shown from the
 * facts themselves.
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
