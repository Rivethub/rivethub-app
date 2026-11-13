import { dayLabel } from "@rivethub/client-runtime/format";
import type { TopicNode } from "@rivethub/contracts";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { usePins, useTopicTree } from "../client/queries";
import { subjectHref } from "../lib/format";
import { MobileHeader } from "./shell";
import { cx } from "./ui";

export type LibraryKind = "topics" | "entities" | "sessions";

/** Phone Library: one screen with a segmented switch between topics, entities and sessions. */
export function LibraryPhone({ kind, children }: { kind: LibraryKind; children: ReactNode }) {
  const pins = usePins().data;
  const tabs: { id: LibraryKind; label: string }[] = [
    { id: "topics", label: "Topics" },
    { id: "entities", label: "Entities" },
    { id: "sessions", label: "Sessions" },
  ];
  return (
    <>
      <MobileHeader>
        <h1 className="m-0 flex-1 text-[22px] font-semibold">Library</h1>
      </MobileHeader>
      <div className="px-4 pb-2">
        <nav aria-label="Library" className="grid grid-cols-3 rounded-[10px] bg-card p-[3px]">
          {tabs.map((t) => (
            <Link
              key={t.id}
              to={`/${t.id}`}
              aria-current={t.id === kind ? "page" : undefined}
              className={cx("flex min-h-9 items-center justify-center rounded-lg text-[13px] hover:no-underline", t.id === kind ? "bg-background font-semibold text-foreground" : "text-muted-foreground")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex flex-col px-2 text-[15px]">
        {pins && pins.length > 0 && (
          <>
            <span className="px-2 pt-2.5 pb-1 text-[12px] font-semibold text-muted-foreground">PINNED</span>
            <div className="flex gap-2 overflow-x-auto px-2 pb-2">
              {pins.map((p) => (
                <Link key={p.id} to={subjectHref(p)} className="flex min-h-10 flex-none items-center rounded-[10px] bg-card px-3 text-foreground hover:no-underline">
                  {p.title}
                </Link>
              ))}
            </div>
          </>
        )}
        {children}
      </div>
    </>
  );
}

function ancestors(tree: TopicNode[], id: string | undefined): Set<string> {
  const out = new Set<string>();
  const walk = (nodes: TopicNode[], trail: string[]): boolean =>
    nodes.some((n) => {
      if (n.id === id) {
        trail.forEach((t) => out.add(t));
        return true;
      }
      return walk(n.children, [...trail, n.id]);
    });
  walk(tree, []);
  return out;
}

/** The topic tree. The selected topic's ancestors start open. */
export function TopicTree({ selected, phone }: { selected?: string; phone?: boolean }) {
  const tree = useTopicTree().data ?? [];
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const auto = ancestors(tree, selected);
  if (selected) auto.add(selected);
  const isOpen = (id: string) => overrides.get(id) ?? (auto.has(id) || (phone === true && tree.some((t) => t.id === id)));
  const toggle = (id: string) => setOverrides((prev) => new Map(prev).set(id, !isOpen(id)));

  const rows: ReactNode[] = [];
  const walk = (nodes: TopicNode[], depth: number) => {
    for (const n of nodes) {
      const expandable = n.children.length > 0;
      const expanded = expandable && isOpen(n.id);
      rows.push(
        <li key={n.id} role="treeitem" aria-level={depth + 1} aria-expanded={expandable ? expanded : undefined} aria-selected={n.id === selected}>
          <div
            className={cx("flex items-center gap-1.5 rounded-md", phone ? "min-h-12 border-b border-border pr-3" : "py-[5px] pr-2.5 text-[13px]", n.id === selected && "bg-selected", !phone && "hover:bg-accent")}
            style={{ paddingLeft: (phone ? 12 : 4) + depth * (phone ? 18 : 14) }}
          >
            {expandable ? (
              <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${n.name}`} onClick={() => toggle(n.id)} className={cx("flex shrink-0 items-center justify-center text-muted-foreground", phone ? "size-8 text-[12px]" : "size-4 text-[10px]")}>
                {expanded ? "▾" : "▸"}
              </button>
            ) : (
              <span className={phone ? "size-8" : "size-4"} />
            )}
            <Link to="/topics/$topicId" params={{ topicId: n.id }} className="flex min-w-0 flex-1 items-center gap-2 text-foreground hover:no-underline">
              {phone ? (
                <span className="flex flex-1 flex-col">
                  <span className={depth ? "" : "font-semibold"}>{n.name}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {n.sessionCount} sessions{n.status === "closed" ? " · closed" : ""}
                    {n.lastActivity ? ` · ${dayLabel(n.lastActivity) === "Today" ? "today" : dayLabel(n.lastActivity)}` : ""}
                  </span>
                </span>
              ) : (
                <span className="flex-1 truncate">{n.name}</span>
              )}
              <span className="text-[11px] text-muted-foreground">{phone ? "›" : n.sessionCount}</span>
            </Link>
          </div>
        </li>,
      );
      if (expanded) walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return (
    <ul role="tree" aria-label="Topics" className="m-0 flex list-none flex-col p-0">
      {rows}
    </ul>
  );
}

export function TopicTreeSection({ selected }: { selected?: string }) {
  return <TopicTree {...(selected ? { selected } : {})} />;
}
