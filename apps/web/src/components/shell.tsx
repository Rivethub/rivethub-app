import { count } from "@rivethub/client-runtime/format";
import { canSwitchTo, currentHubSummary } from "@rivethub/client-runtime/hub-list";
import type { Hub } from "@rivethub/contracts";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, useHarnesses, useHubs, useLibraryCounts, useMe, useMemoryStats, useModelJobs, usePins, useReviewQueue } from "../client/queries";
import { harnessAction } from "../lib/connections";
import { subjectHref } from "../lib/format";
import { useIsPhone, useIsWide } from "../lib/media";
import { useTheme, THEMES } from "../theme";
import { GearIcon, LibraryIcon, ReviewIcon, SearchIcon, TodayIcon } from "./icons";
import { Modal } from "./modal";
import { GuideRow } from "./journey";
import { usePalette } from "./palette";
import { cx, Dot } from "./ui";

/**
 * Desktop: left sidebar, main column, optional right panel.
 * Phone: the main column only, with the bottom tabs when `tabs` is set.
 */
export function Frame({ sidebar, aside, tabs, children }: { sidebar: ReactNode; aside?: ReactNode; tabs?: boolean; children: ReactNode }) {
  const phone = useIsPhone();
  const wide = useIsWide();
  if (phone) {
    return (
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <main id="main" className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
        {tabs && <MobileTabs />}
      </div>
    );
  }
  return (
    <div className="flex h-dvh bg-sidebar text-foreground">
      {sidebar}
      <div className={cx("my-2 mr-2 flex min-w-0 flex-1 overflow-hidden rounded-[18px] border border-border bg-background", !sidebar && "ml-2")}>
        <main id="main" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
          {aside && !wide && <div className="flex border-t border-border">{aside}</div>}
        </main>
        {aside && wide && <div className="flex shrink-0 overflow-y-auto">{aside}</div>}
      </div>
    </div>
  );
}

const navRow = "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-foreground hover:bg-accent hover:no-underline";

function ReviewBadge({ className }: { className?: string }) {
  const n = useReviewQueue().data?.length ?? 0;
  if (!n) return null;
  return (
    <span aria-label={`${n} waiting`} className={cx("rounded-full bg-warning px-1.5 text-[12px] text-primary-foreground", className)}>
      {n}
    </span>
  );
}

export function SidebarSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center justify-between px-2.5 pt-3.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        <span>{title}</span>
        {action}
      </span>
      {children}
    </div>
  );
}

/** Geometry from the owner-approved rivethub-icon.svg (2026-11-14). */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg role="img" aria-label="RivetHub" className="shrink-0" viewBox="0 0 512 512" width={size} height={size}><rect width="512" height="512" rx="112" fill="#181e1b"/><rect x="4" y="4" width="504" height="504" rx="108" fill="none" stroke="#2b332e" strokeWidth="8"/><g transform="translate(256 256) scale(1) translate(-256 -256)"><g transform="translate(9.50 0)"><g className="ink" fill="none" stroke="#dee4df" strokeWidth="60"><path d="M100 390V180.0"/><path d="M261.0 390V122"/><path d="M261.0 276A66 66 0 0 1 393.0 276V390"/></g><circle className="rivet" cx="174.0" cy="210" r="33" fill="#6cdbac"/></g></g></svg>
  );
}

export function SidebarShell({ children, label = "Sidebar", className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx("flex w-[244px] shrink-0 flex-col gap-0.5 overflow-y-auto bg-sidebar px-2 py-2.5", className)}>
      {children}
    </nav>
  );
}

/** Stats, with a dot when a worker is failing so trouble is visible from any screen. */
function StatsRow({ active }: { active: boolean }) {
  const stats = useMemoryStats().data;
  if (stats === null) return null;
  const failing = stats?.workers.some((w) => w.failing > 0) ?? false;
  return (
    <Link to="/stats" className={cx(navRow, "text-[13px]", active && "bg-selected")} aria-current={active ? "page" : undefined}>
      <span className="flex-1">Stats</span>
      {failing && <span className="flex items-center gap-1.5 text-[12px] text-warning"><Dot color="var(--warning)" size={7} />needs a look</span>}
    </Link>
  );
}

const LIBRARY = [
  { label: "Sessions", to: "/sessions", key: "sessions" },
  { label: "Topics", to: "/topics", key: "topics" },
  { label: "Entities", to: "/entities", key: "entities" },
] as const;

/**
 * The main sidebar, the same on every screen: search, Today, Review, the
 * library, sharing and pins. `children` is the open library section's own
 * list (the topic tree, the entity kinds) and nests under its row.
 */
export function MainSidebar({ children }: { children?: ReactNode }) {
  const palette = usePalette();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const counts = useLibraryCounts().data;
  const pins = usePins().data;
  const at = (to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`));
  const row = (to: string) => cx(navRow, at(to) && "bg-selected");
  const current = (to: string) => (at(to) ? ("page" as const) : undefined);
  const sharing = at("/shared") || at("/share") || at("/receive");
  return (
    <SidebarShell>
      <Link to="/" className="flex items-center gap-2 px-2 pt-1 pb-2.5 text-foreground hover:no-underline">
        <Logo />
        <span aria-hidden="true" className="font-bold" style={{ fontFamily: "Inter, sans-serif" }}>rivet<span className="text-primary">hub</span></span>
      </Link>
      <button type="button" onClick={palette.open} className="mb-2 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-[7px] text-left text-muted-foreground hover:text-foreground">
        <SearchIcon size={14} />
        <span className="flex-1">Search or jump to…</span>
        <kbd>⌘K</kbd>
      </button>
      <Link to="/" className={row("/")} aria-current={current("/")}>
        <span className="flex-1">Today</span>
      </Link>
      <Link to="/review" className={row("/review")} aria-current={current("/review")}>
        <span className="flex-1">Review</span>
        <ReviewBadge />
      </Link>
      <SidebarSection title="Library">
        {LIBRARY.map((r) => (
          <div key={r.key} className="flex flex-col gap-0.5">
            <Link to={r.to} className={row(r.to)} aria-current={path === r.to ? "page" : undefined}>
              <span className="flex-1">{r.label}</span>
              {counts?.[r.key] !== undefined && <span className="text-[12px] text-muted-foreground">{count(counts[r.key])}</span>}
            </Link>
            {children && at(r.to) && <div className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-border pl-1.5">{children}</div>}
          </div>
        ))}
        <Link to="/shared" className={cx(navRow, sharing && "bg-selected")} aria-current={path === "/shared" ? "page" : undefined}>
          <span className="flex-1">Shared</span>
        </Link>
      </SidebarSection>
      {pins && pins.length > 0 && (
        <SidebarSection title="Pinned">
          {pins.map((p) => (
            <Link key={p.id} to={subjectHref(p)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-foreground hover:bg-accent hover:no-underline">
              <Dot color="var(--muted-foreground)" size={6} />
              <span className="truncate">{p.title}</span>
            </Link>
          ))}
        </SidebarSection>
      )}
      <div className="flex-1" />
      <StatsRow active={at("/stats")} />
      <GuideRow />
      <SidebarFooter />
    </SidebarShell>
  );
}

export function HubList({ hubs, onPick }: { hubs: Hub[]; onPick?: () => void }) {
  return (
    <>
      {hubs.map((h) => {
        const body = (
          <>
            <Dot color={h.online ? "var(--success)" : "var(--muted-foreground)"} size={8} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{h.name}</span>
              <span className="truncate text-[11px] text-muted-foreground md:text-[11px]">{h.detail}</span>
            </span>
            {h.current && <span className="text-primary" aria-label="Current hub">✓</span>}
          </>
        );
        const cls = cx("flex min-h-14 items-center gap-2 rounded-lg p-2 text-foreground hover:no-underline md:min-h-0", h.current ? "bg-selected" : "hover:bg-accent");
        if (!canSwitchTo(h)) {
          return (
            <span key={h.id} role="menuitem" aria-current={h.current || undefined} aria-disabled={!h.current || undefined} className={cx(cls, !h.online && "opacity-70")} onClick={onPick}>
              {body}
            </span>
          );
        }
        return <a key={h.id} role="menuitem" href={h.url} className={cls}>{body}</a>;
      })}
    </>
  );
}

function SidebarFooter() {
  const hubs = useHubs().data;
  const harnesses = useHarnesses().data;
  const spaces = useMe().data?.spaces.map((space) => space.name);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = currentHubSummary(hubs, harnesses?.filter((h) => h.capture.state === "receiving").length, spaces);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative flex items-center gap-1 border-t border-border pt-1.5">
      {open && hubs && (
        <div role="menu" aria-label="Memory hubs" className="absolute right-0 bottom-[52px] left-0 z-10 flex flex-col rounded-xl border border-input bg-card p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.3)]">
          <span className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">MEMORY HUBS</span>
          <HubList hubs={hubs} onPick={() => setOpen(false)} />
          <Link to="/settings/$section" params={{ section: "server" }} role="menuitem" className="mt-1 border-t border-border p-2 text-[13px] text-muted-foreground">
            + Connect to a hub…
          </Link>
        </div>
      )}
      <button
        type="button"
        aria-label={`Switch memory hub, current ${current.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-selected px-2 py-1.5 text-left text-foreground"
      >
        <Dot color={current.online ? "var(--success)" : "var(--muted-foreground)"} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-medium">{current.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">{current.meta}</span>
        </span>
        <span aria-hidden="true" className="text-[12px] text-muted-foreground">{open ? "▾" : "▴"}</span>
      </button>
      <Link to="/settings" aria-label="Settings" className="flex size-[34px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
        <GearIcon />
      </Link>
    </div>
  );
}

const tabs = [
  { label: "Today", to: "/", Icon: TodayIcon, match: (p: string) => p === "/" },
  { label: "Review", to: "/review", Icon: ReviewIcon, match: (p: string) => p.startsWith("/review") },
  { label: "Library", to: "/topics", Icon: LibraryIcon, match: (p: string) => /^\/(topics|entities|sessions|library)/.test(p) },
  { label: "Search", to: "/search", Icon: SearchIcon, match: (p: string) => p.startsWith("/search") },
] as const;

export function MobileTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Tabs" className="grid shrink-0 grid-cols-4 border-t border-border bg-sidebar px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),18px)]">
      {tabs.map(({ label, to, Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={label}
            to={to}
            aria-current={active ? "page" : undefined}
            className={cx("relative flex min-h-12 flex-col items-center justify-center gap-[3px] text-[11px] hover:no-underline", active ? "text-primary" : "text-muted-foreground")}
          >
            <Icon size={22} />
            {label}
            {label === "Review" && <ReviewBadge className="absolute top-0.5 left-[54%] px-[5px] text-[10px] font-bold" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** The phone header's hub chip. Opens a sheet with the hub switcher and settings. */
export function HubChip() {
  const hubs = useHubs().data;
  const [open, setOpen] = useState(false);
  const current = currentHubSummary(hubs, undefined);
  return (
    <>
      <button
        type="button"
        aria-label="Memory hub and settings"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] text-foreground"
      >
        <Dot color={current.online ? "var(--success)" : "var(--muted-foreground)"} size={7} />
        {current.name} ▾
      </button>
      {open && <HubSheet hubs={hubs ?? []} onClose={() => setOpen(false)} />}
    </>
  );
}

function HubSheet({ hubs, onClose }: { hubs: Hub[]; onClose: () => void }) {
  const harnesses = useHarnesses().data;
  const jobs = useModelJobs().data;
  const account = useAccount().data;
  const theme = useTheme();
  const toFix = (harnesses?.filter((h) => harnessAction(h)).length ?? 0) + (jobs?.filter((j) => j.health !== "healthy").length ?? 0);
  const rows = [
    { label: "Connections", section: "connections", hint: toFix ? `${toFix} to fix` : "", color: "var(--warning)" },
    { label: "Account and updates", section: "account", hint: account?.pendingUpdate ? `${account.pendingUpdate.version} ready` : "", color: "var(--info)" },
    { label: "Sharing", section: "sharing", hint: "", color: "var(--muted-foreground)" },
    { label: "Trust rules", section: "trust", hint: "", color: "var(--muted-foreground)" },
    { label: "Appearance", section: "appearance", hint: THEMES.find((t) => t.id === theme)?.label ?? "", color: "var(--muted-foreground)" },
  ];
  return (
    <Modal label="Memory hub and settings" placement="sheet" onClose={onClose} className="gap-1.5 px-3">
      <span className="px-2 py-1 text-[12px] font-semibold text-muted-foreground">MEMORY HUB</span>
      <div role="menu" aria-label="Memory hubs" className="flex flex-col">
        <HubList hubs={hubs} onPick={onClose} />
      </div>
      <Link to="/settings/$section" params={{ section: "server" }} onClick={onClose} className="flex min-h-12 items-center px-3 text-muted-foreground">
        + Connect to a hub…
      </Link>
      <span className="my-1 h-px bg-border" />
      {[
        { label: "Shared", to: "/shared" },
        { label: "Stats", to: "/stats" },
        { label: "Guide", to: "/guide" },
      ].map((r) => (
        <Link key={r.to} to={r.to} onClick={onClose} className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-foreground hover:no-underline">
          <span className="flex-1">{r.label}</span>
          <span className="text-muted-foreground">›</span>
        </Link>
      ))}
      <span className="my-1 h-px bg-border" />
      {rows.map((r) => (
        <Link key={r.section} to="/settings/$section" params={{ section: r.section }} onClick={onClose} className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-foreground hover:no-underline">
          <span className="flex-1">{r.label}</span>
          <span className="text-[13px]" style={{ color: r.color }}>{r.hint}</span>
          <span className="text-muted-foreground">›</span>
        </Link>
      ))}
    </Modal>
  );
}

/** Phone header for top-level tabs: title on the left, hub chip on the right. */
export function MobileHeader({ children }: { children: ReactNode }) {
  return <header className="flex items-center gap-2.5 px-4 pt-4 pb-2">{children}<HubChip /></header>;
}
