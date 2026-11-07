import type { Hub } from "@rivethub/contracts";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, useHarnesses, useHubs, useLibraryCounts, useModelJobs, usePins, useReviewQueue } from "../client/queries";
import { count, subjectHref } from "../lib/format";
import { useIsPhone, useIsWide } from "../lib/media";
import { useTheme, THEMES } from "../theme";
import { GearIcon, LibraryIcon, ReviewIcon, SearchIcon, TodayIcon } from "./icons";
import { Modal } from "./modal";
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
    <div className="flex h-dvh bg-background text-foreground">
      {sidebar}
      <main id="main" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
        {aside && !wide && <div className="flex border-t border-border">{aside}</div>}
      </main>
      {aside && wide && <div className="flex shrink-0 overflow-y-auto">{aside}</div>}
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

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground" style={{ width: size, height: size, fontSize: size <= 22 ? size / 2 : 14 }}>
      rh
    </span>
  );
}

export function SidebarShell({ children, label = "Sidebar", className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx("flex w-[244px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-sidebar px-2 py-2.5", className)}>
      {children}
    </nav>
  );
}

/** The main sidebar. `children` is the page's own section: library links, the topic tree, or entity kinds. */
export function MainSidebar({ children }: { children?: ReactNode }) {
  const palette = usePalette();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <SidebarShell>
      <Link to="/" className="flex items-center gap-2 px-2 pt-1 pb-2.5 text-foreground hover:no-underline">
        <Logo />
        <span className="font-semibold">Rivet<span className="font-normal text-muted-foreground">Hub</span></span>
      </Link>
      <button type="button" onClick={palette.open} className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-[7px] text-left text-muted-foreground hover:text-foreground">
        <SearchIcon size={14} />
        <span className="flex-1">Search or jump to…</span>
        <kbd>⌘K</kbd>
      </button>
      <Link to="/" className={cx(navRow, path === "/" && "bg-selected")} aria-current={path === "/" ? "page" : undefined}>
        <span className="flex-1">Today</span>
      </Link>
      <Link to="/review" className={cx(navRow, path === "/review" && "bg-selected")} aria-current={path === "/review" ? "page" : undefined}>
        <span className="flex-1">Review</span>
        <ReviewBadge />
      </Link>
      {children ?? <LibraryAndPins />}
      <div className="flex-1" />
      <SidebarFooter />
    </SidebarShell>
  );
}

function LibraryAndPins() {
  const counts = useLibraryCounts().data;
  const pins = usePins().data;
  const rows = [
    { label: "Topics", to: "/topics", n: counts?.topics },
    { label: "Entities", to: "/entities", n: counts?.entities },
    { label: "Sessions", to: "/sessions", n: counts?.sessions },
  ];
  return (
    <>
      <SidebarSection title="Library">
        {rows.map((r) => (
          <Link key={r.to} to={r.to} className="flex justify-between rounded-lg px-2.5 py-1.5 text-foreground hover:bg-accent hover:no-underline">
            <span>{r.label}</span>
            {r.n !== undefined && <span className="text-[12px] text-muted-foreground">{count(r.n)}</span>}
          </Link>
        ))}
      </SidebarSection>
      {pins && pins.length > 0 && (
        <SidebarSection title="Pinned">
          {pins.map((p) => (
            <Link key={p.id} to={subjectHref(p)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-foreground hover:bg-accent hover:no-underline">
              <Dot color="var(--muted-foreground)" size={6} />
              {p.title}
            </Link>
          ))}
        </SidebarSection>
      )}
    </>
  );
}

function hubMeta(hubs: Hub[] | undefined, harnessCount: number | undefined) {
  const current = hubs?.find((h) => h.current);
  if (!current) return { name: "No hub", meta: "Not connected", online: false };
  const meta = current.kind === "local" ? `Local hub${harnessCount !== undefined ? ` · ${harnessCount} harnesses` : ""}` : current.detail;
  return { name: current.name, meta, online: current.online };
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
        if (h.current || !h.online || h.url === "#") {
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
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = hubMeta(hubs, harnesses?.filter((h) => h.capture.state === "receiving").length);
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
  const current = hubMeta(hubs, undefined);
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
  const toFix = (harnesses?.filter((h) => h.capture.state === "stale").length ?? 0) + (jobs?.filter((j) => j.health !== "healthy").length ?? 0);
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
