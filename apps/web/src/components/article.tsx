import { dayLabel } from "@rivethub/client-runtime/format";
import type { SessionSummaryRow } from "@rivethub/contracts";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BackIcon } from "./icons";
import { cx } from "./ui";

export interface Tab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/** Article tabs as links that set `?tab=`. Desktop draws an underline, phone a segmented control. */
export function ArticleTabs<T extends string>({ tabs, active, search, phone }: { tabs: Tab<T>[]; active: T; search: (tab: T) => Record<string, unknown>; phone?: boolean }) {
  return (
    <div role="tablist" aria-label="Sections" className={phone ? "grid grid-cols-3 rounded-[10px] bg-card p-[3px]" : "flex"}>
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <Link
            key={t.id}
            to="."
            search={search(t.id) as never}
            role="tab"
            aria-selected={selected}
            className={
              phone
                ? cx("flex min-h-9 items-center justify-center rounded-lg text-[13px] hover:no-underline", selected ? "bg-background font-semibold text-foreground" : "text-muted-foreground")
                : cx("border-b-2 px-3 py-2.5 text-[13px] hover:no-underline", selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
            {t.count !== undefined && ` ${t.count}`}
          </Link>
        );
      })}
    </div>
  );
}

export function ArticleBar({ crumbs, children }: { crumbs: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-6">
      <span className="min-w-[200px] flex-1 py-2.5 text-[13px] text-muted-foreground">{crumbs}</span>
      {children}
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    // One line: a long title is cut with an ellipsis here and shown in full as the page heading.
    <nav aria-label="Breadcrumb" className="truncate">
      {items.map((c, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true"> › </span>}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page" title={c.label}>{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Two columns: the reading column and the side panel, wrapping under 1000px. */
export function ArticleBody({ children, side }: { children: ReactNode; side: ReactNode }) {
  return (
    <div className="flex flex-1 flex-wrap content-start items-start gap-7 px-8 py-[26px]">
      <article className="flex min-w-0 flex-[999_1_440px] flex-col gap-3.5 font-serif text-[16px] leading-[1.65]">{children}</article>
      {side}
    </div>
  );
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <h2 className="mt-3 flex items-baseline border-b border-border pb-1 font-serif text-[21px] font-semibold">
      {children}
      {right && (
        <>
          <span className="flex-1" />
          <span className="font-sans text-[13px] font-normal">{right}</span>
        </>
      )}
    </h2>
  );
}

export function SessionRows({ sessions, detail = "gist" }: { sessions: SessionSummaryRow[]; detail?: "gist" | "topic" }) {
  if (!sessions.length) return <p className="font-sans text-[14px] text-muted-foreground">No sessions yet.</p>;
  return (
    <ul className="flex flex-col font-sans text-[14px]">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: s.id }}
            className="grid grid-cols-[60px_minmax(0,1fr)_110px] items-baseline gap-3 border-b border-border py-2 text-foreground hover:bg-accent hover:no-underline"
          >
            <span className="text-[12px] text-muted-foreground">{dayLabel(s.startedAt)}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{s.title}</span>
              <span className="truncate text-[13px] text-muted-foreground">{detail === "topic" ? (s.topic?.path.join(" › ") ?? "Unfiled") : s.gist}</span>
            </span>
            <span className="justify-self-end font-mono text-[11px] text-muted-foreground">{s.harness}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MobileBack({ to, label, children }: { to: string; label: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex items-center gap-1 px-2 pt-2.5 pb-1">
      <Link to={to} aria-label="Back" className="flex size-11 items-center justify-center text-foreground">
        <BackIcon size={22} />
      </Link>
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{label}</span>
      {children}
    </header>
  );
}

export function SidePanel({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <aside aria-label={label} className={cx("flex min-w-0 flex-[1_1_280px] flex-col gap-4 text-[13px] md:max-w-[320px]", className)}>
      {children}
    </aside>
  );
}
