import { articleBody, parseInline, parseMarkdown, type Block, type Inline } from "@rivethub/client-runtime/markdown";
import { useRouterState } from "@tanstack/react-router";
import { Fragment, useEffect, type ReactNode } from "react";
import { cx } from "./ui";

export { articleBody, parseMarkdown };

/**
 * Renders the Markdown the memory workers write into topic and entity pages.
 * The blocks come from the shared parser. This builds React elements and
 * never sets HTML, so page text cannot inject markup.
 */

function renderInline(nodes: Inline[], key = ""): ReactNode[] {
  return nodes.map((node, i) => {
    const k = `${key}${i}`;
    switch (node.kind) {
      case "text":
        return node.text;
      case "code":
        return (
          <code key={k} className="rounded bg-code px-1 py-px font-mono text-[0.86em] break-words">
            {node.text}
          </code>
        );
      case "link": {
        const label = renderInline(node.children, `${k}-`);
        if (/^https?:\/\//i.test(node.href)) {
          return (
            <a key={k} href={node.href} target="_blank" rel="noreferrer noopener">
              {label}
            </a>
          );
        }
        if (node.href.startsWith("/")) return <a key={k} href={node.href}>{label}</a>;
        return <Fragment key={k}>{label}</Fragment>;
      }
      case "strong":
        return (
          <strong key={k} className="font-semibold text-foreground">
            {renderInline(node.children, `${k}-`)}
          </strong>
        );
      case "em":
        return <em key={k}>{renderInline(node.children, `${k}-`)}</em>;
    }
  });
}

function inlineText(nodes: Inline[]): string {
  return nodes.map((node) => (node.kind === "text" || node.kind === "code" ? node.text : inlineText(node.children))).join("");
}

/** A stable fragment from the heading's visible text. Repeats in one article become `slug`, `slug-1`, `slug-2`. */
export function headingId(text: string, seen: Map<string, number>): string {
  const base = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

function hashTarget(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

/**
 * Scroll restoration runs in onRendered, before an article's headings exist, and looks up
 * getElementById with the leading `#` still on the hash. Scroll again once the heading is in the document.
 */
export function useArticleHash(ready: boolean): void {
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    if (!ready) return;
    const id = hashTarget(hash);
    if (!id) return;
    const scroll = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    scroll();
    const frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [ready, hash]);
}

function renderBlock(block: Block, key: number, seen: Map<string, number>): ReactNode {
  switch (block.kind) {
    case "heading": {
      // The page title is the h1, so article headings start at h2.
      const level = Math.min(Math.max(block.level, 2), 4);
      const cls = level === 2 ? "mt-4 mb-0 border-b border-border pb-1 text-[20px] font-semibold" : level === 3 ? "mt-3 mb-0 text-[17px] font-semibold" : "mt-2 mb-0 text-[15px] font-semibold";
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      const nodes = parseInline(block.text);
      return <Tag key={key} id={headingId(inlineText(nodes), seen)} className={cls}>{renderInline(nodes)}</Tag>;
    }
    case "paragraph":
      return <p key={key} className="m-0">{renderInline(parseInline(block.text))}</p>;
    case "code":
      return <pre key={key} tabIndex={0} className="m-0 overflow-x-auto rounded-lg bg-code p-3 font-mono text-[13px] leading-[1.5]"><code>{block.text}</code></pre>;
    case "quote":
      return <blockquote key={key} className="m-0 border-l-2 border-input pl-3 text-muted-foreground">{renderInline(parseInline(block.text))}</blockquote>;
    case "rule":
      return <hr key={key} className="m-0 border-0 border-t border-border" />;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={key} className={cx("m-0 flex flex-col gap-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, i) => (
            <li key={i} className="pl-0.5 marker:text-muted-foreground">
              {renderInline(parseInline(item.text))}
              {item.children.length > 0 && <div className="mt-1.5 flex flex-col gap-1.5">{item.children.map((child, childKey) => renderBlock(child, childKey, seen))}</div>}
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
              <tr>{block.head.map((h, i) => <th key={i} scope="col" className="border-b border-input px-2 py-1.5 text-left font-semibold">{renderInline(parseInline(h))}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>{row.map((c, i) => <td key={i} className="border-b border-border px-2 py-1.5 align-top">{renderInline(parseInline(c))}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const seen = new Map<string, number>();
  return <div className={cx("flex flex-col gap-3", className)}>{parseMarkdown(source).map((block, key) => renderBlock(block, key, seen))}</div>;
}
