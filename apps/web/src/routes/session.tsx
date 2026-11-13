import { count, dayLabel, harnessNames, longDay, localDay, shortDate, time } from "@rivethub/client-runtime/format";
import type { SessionDetail, SessionId, SessionQuery, SessionSummaryRow, SummaryNode, TopicId, TopicNode, TranscriptTurn, Visibility } from "@rivethub/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useClient, useShareClient } from "../client/context";
import { useCreateTopic, useHarnesses, useKeep, useLibraryCounts, usePlaceSession, useRenameSession, useRestore, useSession, useSessions, useSetVisibility, useSummaryTree, useTag, useTopicTree, useTranscript, useTrash } from "../client/queries";
import { ArticleBar, ArticleTabs, Crumbs, MobileBack } from "../components/article";
import { EditableText } from "../components/editable";
import { FolderIcon, KeepIcon, SearchIcon, ShareIcon, TrashIcon } from "../components/icons";
import { LibraryPhone } from "../components/library";
import { Modal } from "../components/modal";
import { Frame, MainSidebar } from "../components/shell";
import { Button, Chip, cx, ErrorNote, Eyebrow, KindTag, Loading, SampleBadge, Tags } from "../components/ui";
import { changeKind, plural, subjectHref } from "../lib/format";
import { markStep } from "../lib/journey";
import { useIsPhone } from "../lib/media";

const route = getRouteApi("/sessions/$sessionId");
const indexRoute = getRouteApi("/sessions");
type View = NonNullable<SessionQuery["view"]>;

function flattenTopics(nodes: TopicNode[], trail: string[] = []): { id: TopicId; label: string }[] {
  return nodes.flatMap((n) => [{ id: n.id, label: [...trail, n.name].join(" › ") }, ...flattenTopics(n.children, [...trail, n.name])]);
}

const selectCls =
  "w-full appearance-none rounded-lg border border-input bg-card bg-[length:10px] bg-[right_10px_center] bg-no-repeat py-1.5 pr-7 pl-2.5 text-foreground bg-[url(/icons/select-chevron.svg)]";

const dayHeading = (day: string) => (dayLabel(`${day}T12:00`) === "Today" ? "Today" : longDay(day).split(", ").slice(1).join(", "));

const stateNote: Partial<Record<SessionSummaryRow["memoryState"], { label: string; color: string; long: string }>> = {
  capturing: { label: "Capturing", color: "var(--info)", long: "This session is still being captured." },
  queued: { label: "Not summarized yet", color: "var(--muted-foreground)", long: "This session is waiting to be summarized." },
  flagged: { label: "Summary failed", color: "var(--error)", long: "Summarizing this session failed." },
};

/** Pages of the session list. Older pages load on request and stay loaded. */
function useSessionPages(query: SessionQuery) {
  const client = useClient();
  return useInfiniteQuery({
    queryKey: ["sessions", "pages", query],
    queryFn: ({ pageParam }) => client.sessions({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next,
  });
}

function groupByDay(items: SessionSummaryRow[]) {
  const out: { day: string; items: SessionSummaryRow[] }[] = [];
  for (const s of items) {
    const day = localDay(new Date(s.startedAt));
    const last = out.at(-1);
    if (last?.day === day) last.items.push(s);
    else out.push({ day, items: [s] });
  }
  return out;
}

function SessionRow({ s, view, active, phone }: { s: SessionSummaryRow; view: View; active: boolean; phone?: boolean }) {
  const state = stateNote[s.memoryState];
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return (
    <Link
      ref={ref}
      to="/sessions/$sessionId"
      params={{ sessionId: s.id }}
      search={view === "all" ? {} : { view }}
      data-active={active || undefined}
      className={cx(
        "grid items-baseline gap-x-3 border-b border-border text-foreground hover:bg-accent hover:no-underline data-active:bg-selected",
        phone ? "min-h-14 grid-cols-[minmax(0,1fr)] px-3 py-2.5" : "grid-cols-[48px_minmax(0,1fr)_auto] px-2 py-2.5",
      )}
    >
      {!phone && <span className="text-[12px] text-muted-foreground">{time(s.startedAt)}</span>}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium">{s.title}</span>
          {s.kept && <KindTag label="Kept" color="var(--primary)" />}
          {state && <KindTag label={state.label} color={state.color} />}
        </span>
        {s.gist && <span className="line-clamp-2 text-[13px] leading-[1.45] text-muted-foreground">{s.gist}</span>}
        <span className="flex flex-wrap gap-x-2 text-[12px] text-muted-foreground">
          {phone && <span>{time(s.startedAt)} · {harnessNames[s.harness] ?? s.harness}</span>}
          <span style={s.topic ? undefined : { color: "var(--warning)" }}>{s.topic ? s.topic.path.slice(-2).join(" › ") : "Unfiled"}</span>
          <span>· {plural(s.messageCount, "message")}</span>
          {s.childCount ? <span>· {subagents(s.childCount)}</span> : null}
          {s.visibility.kind === "space" && <span>· shared with {s.visibility.space}</span>}
        </span>
      </span>
      {!phone && <span className="font-mono text-[11px] text-muted-foreground">{harnessNames[s.harness] ?? s.harness}</span>}
    </Link>
  );
}

function SessionFilters({ view, onView, text, onText, harness, onHarness, phone }: { view: View; onView: (v: View) => void; text: string; onText: (t: string) => void; harness: string; onHarness: (h: string) => void; phone?: boolean }) {
  const unfiled = useSessions({ view: "unfiled" }).data?.items.length;
  const harnesses = (useHarnesses().data ?? []).filter((h) => h.capture.state !== "not-connected");
  const views: { id: View; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unfiled", label: `Unfiled${unfiled ? ` ${unfiled}` : ""}` },
    { id: "kept", label: "Kept" },
    { id: "trash", label: "Trash" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={cx("flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-muted-foreground", phone ? "min-h-11" : "py-1.5")}>
        <SearchIcon size={14} />
        <span className="sr-only">Filter sessions</span>
        <input value={text} onChange={(e) => onText(e.target.value)} placeholder="Filter by title or topic…" className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      {harnesses.length > 1 && (
        <label className="flex flex-col">
          <span className="sr-only">Tool</span>
          <select value={harness} onChange={(e) => onHarness(e.target.value)} className={cx(selectCls, "w-auto", phone && "min-h-11")}>
            <option value="">Every tool</option>
            {harnesses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      )}
      <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
        {views.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => onView(v.id)} className={cx("rounded-full border border-border px-2.5 text-[12px] text-foreground", phone ? "min-h-9 px-3" : "py-1", view === v.id ? "bg-selected" : "bg-transparent")}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const emptyNote: Record<View, string> = {
  all: "No sessions match. A session shows up here when a connected tool finishes a turn.",
  unfiled: "Every session has a topic.",
  kept: "Nothing is kept. Keep a session to protect it from clean-up.",
  trash: "The trash is empty.",
};

/** The list, with its filters. J and K move, Enter opens. */
function SessionBrowser({ view, phone }: { view: View; phone?: boolean }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [harness, setHarness] = useState("");
  const [active, setActive] = useState(-1);
  const pages = useSessionPages({ view, ...(text ? { text } : {}), ...(harness ? { harness } : {}) });
  const items = useMemo(() => pages.data?.pages.flatMap((p) => p.items) ?? [], [pages.data]);
  const groups = useMemo(() => groupByDay(items), [items]);
  useEffect(() => setActive(-1), [view, text, harness]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "j") setActive((a) => Math.min(a + 1, items.length - 1));
      else if (e.key === "k") setActive((a) => Math.max(a - 1, 0));
      else if (e.key === "Enter" && items[active]) void navigate({ to: "/sessions/$sessionId", params: { sessionId: items[active].id }, search: view === "all" ? {} : { view } });
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, active, navigate, view]);
  let n = -1;
  return (
    <>
      <SessionFilters view={view} text={text} onText={setText} harness={harness} onHarness={setHarness} onView={(v) => void navigate({ to: "/sessions", search: v === "all" ? {} : { view: v } })} {...(phone ? { phone } : {})} />
      {pages.isPending ? <Loading /> : pages.isError ? <ErrorNote error={pages.error} /> : groups.length === 0 ? (
        <p className="m-0 py-6 text-muted-foreground">{text || harness ? "No sessions match these filters." : emptyNote[view]}</p>
      ) : (
        <div className="flex flex-col">
          {groups.map((g) => (
            <section key={g.day} aria-label={longDay(g.day)} className="flex flex-col">
              <h2 className="m-0 px-2 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{dayHeading(g.day)}</h2>
              {g.items.map((s) => {
                n += 1;
                return <SessionRow key={s.id} s={s} view={view} active={n === active} {...(phone ? { phone } : {})} />;
              })}
            </section>
          ))}
          {pages.hasNextPage && (
            <Button className="mt-4 self-center" size="md" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
              {pages.isFetchingNextPage ? "Loading…" : "Show older sessions"}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

export function SessionsIndex() {
  const { view = "all" } = indexRoute.useSearch();
  const phone = useIsPhone();
  const total = useLibraryCounts().data?.sessions;
  if (phone) {
    return (
      <Frame sidebar={null} tabs>
        <LibraryPhone kind="sessions">
          <div className="flex flex-col px-2"><SessionBrowser view={view} phone /></div>
        </LibraryPhone>
      </Frame>
    );
  }
  return (
    <Frame sidebar={<MainSidebar />}>
      <div className="flex justify-center px-7 py-8">
        <div className="flex min-w-0 max-w-[900px] flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 flex items-baseline gap-2.5 font-serif text-[32px] font-semibold">
              Sessions
              {total !== undefined && <span className="font-sans text-[13px] font-normal text-muted-foreground">{count(total)}</span>}
              <SampleBadge capability="sessions" />
            </h1>
            <p className="m-0 text-muted-foreground">Every conversation your agents had, as captured. Open one to read its summary, then the messages behind it.</p>
          </div>
          <SessionBrowser view={view} />
        </div>
      </div>
    </Frame>
  );
}

/** The sessions on either side of this one in the list it was opened from. */
function useNeighbors(id: string, view: View) {
  const items = useSessions({ view }).data?.items ?? [];
  const i = items.findIndex((s) => s.id === id);
  return { newer: i > 0 ? items[i - 1] : undefined, older: i >= 0 ? items[i + 1] : undefined };
}

const visibilityKey = (v: Visibility) => (v.kind === "private" ? "private" : `space:${v.space}`);

export function SessionPage() {
  const { sessionId } = route.useParams();
  const search = route.useSearch();
  const phone = useIsPhone();
  const s = useSession(sessionId as SessionId);
  // Lead with the summary when there is one; otherwise the messages are all there is.
  const tab = search.tab ?? (!s.data || s.data.memoryState === "summarized" ? "summary" : "transcript");
  const view = search.view ?? "all";
  const near = useNeighbors(sessionId, view);
  const canSend = useShareClient() !== null;
  const keep = useKeep();
  const trash = useTrash();
  const restore = useRestore();
  const navigate = useNavigate();
  const range: [number, number] | undefined = search.from !== undefined ? [search.from, search.to ?? search.from] : undefined;
  const d = s.data;
  const tabs = [
    { id: "summary" as const, label: "Summary" },
    { id: "transcript" as const, label: "Transcript", count: d?.messageCount ?? 0 },
  ];
  const fallback = s.isPending ? <Loading /> : s.isError ? <ErrorNote error={s.error} /> : null;
  const doTrash = () => {
    trash.mutate([sessionId as SessionId]);
    void navigate({ to: "/sessions" });
  };

  if (phone) {
    return (
      <Frame sidebar={null}>
        <MobileBack to="/sessions" label={d ? `${d.harness} · ${shortDate(d.startedAt)}` : "Sessions"}>
          {d?.resumeCommand && <CopyButton text={d.resumeCommand} label="Resume" className="min-h-9 rounded-full border border-border bg-card px-3 text-[13px]" />}
        </MobileBack>
        {fallback ?? (
          <>
            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-1 pb-3 text-[15px]">
              <h1 className="m-0 font-serif text-[25px] font-semibold">{d!.title}</h1>
              <SampleBadge capability="sessions" />
              <details className="rounded-[14px] border border-border bg-card">
                <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-3.5">
                  <span className="flex-1 font-medium">Changed {d!.changed.length} thing{d!.changed.length === 1 ? "" : "s"}</span>
                  <span className="text-[13px] text-muted-foreground">{d!.topic?.path.slice(-2).join(" › ") ?? "Unfiled"}</span>
                </summary>
                <div className="flex flex-col gap-1.5 px-3.5 pb-3"><Changes d={d!} /></div>
              </details>
              <StateNote d={d!} />
              <ArticleTabs tabs={tabs.map((t) => ({ ...t }))} active={tab} search={(id) => ({ tab: id })} phone />
              {tab === "summary" ? <SummaryView id={d!.id} /> : <TranscriptView id={d!.id} range={range} phone />}
            </div>
            <PhoneActions d={d!} onTrash={doTrash} onRestore={() => restore.mutate([d!.id])} />
          </>
        )}
      </Frame>
    );
  }

  return (
    <Frame sidebar={<MainSidebar />} aside={d && <SessionSide d={d} />}>
      {fallback ?? (
        <>
          <ArticleBar crumbs={<Crumbs items={[{ label: view === "all" ? "Sessions" : `Sessions · ${view}`, to: view === "all" ? "/sessions" : `/sessions?view=${view}` }, { label: d!.title }]} />}>
            <span className="mr-2 flex gap-1 text-[12px]">
              {near.newer ? <Link to="/sessions/$sessionId" params={{ sessionId: near.newer.id }} search={view === "all" ? {} : { view }} title={near.newer.title} className="rounded-md border border-border px-2 py-0.5 text-foreground hover:bg-accent hover:no-underline">‹ Newer</Link> : null}
              {near.older ? <Link to="/sessions/$sessionId" params={{ sessionId: near.older.id }} search={view === "all" ? {} : { view }} title={near.older.title} className="rounded-md border border-border px-2 py-0.5 text-foreground hover:bg-accent hover:no-underline">Older ›</Link> : null}
            </span>
            <ArticleTabs tabs={tabs} active={tab} search={(id) => ({ ...search, tab: id, from: undefined, to: undefined })} />
            {canSend && <Link to="/share" search={{ session: d!.id }} className="ml-2 rounded-lg border border-border px-2.5 py-1 text-[12px] text-foreground hover:bg-accent hover:no-underline">Share…</Link>}
            <Button className={canSend ? "" : "ml-2"} aria-pressed={d!.kept} onClick={() => keep.mutate({ id: d!.id, keep: !d!.kept })}>{d!.kept ? "Kept" : "Keep"}</Button>
            {d!.trashed ? (
              <Button onClick={() => restore.mutate([d!.id])} disabled={restore.isPending}>Restore</Button>
            ) : (
              <Button variant="danger" onClick={doTrash}>Trash</Button>
            )}
          </ArticleBar>
          <div className="flex flex-1 flex-col gap-[18px] px-8 py-6">
            <SessionHeader d={d!} />
            <StateNote d={d!} />
            {tab === "summary" ? <SummaryView id={d!.id} /> : <TranscriptView id={d!.id} range={range} />}
          </div>
        </>
      )}
    </Frame>
  );
}

const subagents = (n: number) => `${n} subagent${n === 1 ? "" : "s"}`;

function SessionHeader({ d }: { d: SessionDetail }) {
  const rename = useRenameSession();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
        <h1 className="m-0 flex items-center gap-2 font-serif text-[28px] font-semibold">
          <EditableText label="Session title" value={d.title} onSave={(title) => title && rename.mutate({ id: d.id, title })} />
          <SampleBadge capability="sessions" />
        </h1>
        {rename.isError && <span role="alert" className="text-[13px] text-error">The title was not changed: this tool keeps its own session titles.</span>}
        <span className="text-[13px] text-muted-foreground">
          {harnessNames[d.harness] ?? d.harness} · {shortDate(d.startedAt)}, {time(d.startedAt)}
          {d.endedAt ? `–${time(d.endedAt)}` : ""} · {plural(d.messageCount, "message")}{d.cwd ? ` · ` : ""}
          {d.cwd && <span className="font-mono text-[12px]">{d.cwd}</span>}
        </span>
        {d.childCount ? <span className="text-[13px] text-muted-foreground">{subagents(d.childCount)}</span> : null}
      </div>
      {d.resumeCommand && (
        <>
          <code className="rounded-md bg-code px-2 py-1 font-mono text-[12px]">{d.resumeCommand}</code>
          <span title={`Paste in a terminal to pick this session back up in ${harnessNames[d.harness] ?? d.harness}`}>
            <CopyButton text={d.resumeCommand} label="Copy resume command" className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground" />
          </span>
        </>
      )}
    </div>
  );
}

function CopyButton({ text, label, className }: { text: string; label: string; className: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy the resume command", text);
        }
      }}
    >
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

/** Says why there is no summary to lead with, and what to do about it. */
function StateNote({ d }: { d: SessionDetail }) {
  const state = stateNote[d.memoryState];
  if (!state) return null;
  return (
    <p className="m-0 rounded-lg border border-border px-3 py-2 text-[13px] text-muted-foreground">
      <span style={{ color: state.color }}>{state.long}</span>{" "}
      {d.memoryState === "capturing" ? "The messages so far are below." : <>Summaries need a model. <Link to="/settings/$section" params={{ section: "connections" }}>Check the models</Link></>}
    </p>
  );
}

function SummaryView({ id }: { id: SessionId }) {
  const tree = useSummaryTree(id);
  useEffect(() => {
    if (tree.data) markStep("summary");
  }, [tree.data]);
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  if (tree.isPending) return <Loading />;
  if (tree.isError) {
    return (
      <section aria-label="Session summary" className="flex flex-col gap-1.5 rounded-xl border border-dashed border-input px-[18px] py-4">
        <span className="font-semibold">No summary yet</span>
        <span className="text-[13px] leading-[1.5] text-muted-foreground">
          A summary is written after a session ends, by the model set for summaries. Every message is still here.{" "}
          <Link to="." search={{ tab: "transcript" } as never}>Read the transcript</Link>
        </span>
      </section>
    );
  }
  const root = tree.data;
  const leaves = root.children.reduce((n, b) => n + b.children.length, 0);
  return (
    <>
      <section aria-label="Session summary" className="flex flex-col gap-2 rounded-xl border border-border bg-card px-[18px] py-4">
        <span className="flex flex-wrap items-center gap-2">
          <KindTag label="Root" color="var(--primary)" />
          <span className="flex-1 font-semibold">{root.title ?? "Whole session"}</span>
          <span className="text-[12px] text-muted-foreground">
            from {root.children.length} branches · {leaves} leaves{root.model ? ` · ${root.model}` : ""}{root.at ? ` · ${shortDate(root.at)} ${time(root.at)}` : ""}
          </span>
        </span>
        <p className="m-0 font-serif text-[16px] leading-[1.6]">{root.text}</p>
      </section>
      <section aria-label="Summary tree" className="flex flex-col gap-2.5">
        {root.children.map((b, i) => (
          <Branch key={i} node={b} expanded={open.has(i)} onToggle={() => setOpen((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })} />
        ))}
      </section>
    </>
  );
}

const rangeLabel = (r: [number, number]) => `${r[0]}–${r[1]}`;

function Branch({ node, expanded, onToggle }: { node: SummaryNode; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-border pl-[18px]">
      <button type="button" aria-expanded={expanded} onClick={onToggle} className={cx("flex flex-wrap items-center gap-2 rounded-[10px] border border-border px-2.5 py-2 text-left text-foreground", expanded ? "bg-card" : "bg-transparent hover:bg-accent")}>
        <span aria-hidden="true" className="w-2.5 text-muted-foreground">{expanded ? "▾" : "▸"}</span>
        <KindTag label="Branch" color="var(--info)" />
        <span className="font-medium">{node.title}</span>
        <span className="min-w-40 flex-1 text-[13px] text-muted-foreground">{node.text}</span>
        <span className="text-[12px] text-muted-foreground">msgs {rangeLabel(node.messageRange)}</span>
      </button>
      {expanded &&
        node.children.map((l, i) => (
          <div key={i} className="ml-[18px] flex flex-col gap-1 border-l-2 border-border px-2.5 py-1.5 md:grid md:grid-cols-[70px_minmax(0,1fr)_auto] md:items-baseline md:gap-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Leaf · {rangeLabel(l.messageRange)}</span>
            <span className="leading-[1.5]">{l.text}</span>
            <Link to="." search={{ tab: "transcript", from: l.messageRange[0], to: l.messageRange[1] } as never} className="text-[12px]">View in transcript</Link>
          </div>
        ))}
    </div>
  );
}

function TranscriptView({ id, range, phone }: { id: SessionId; range: [number, number] | undefined; phone?: boolean }) {
  const transcript = useTranscript(id);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    first.current?.scrollIntoView?.({ block: "start" });
  }, [range?.[0], transcript.data]);
  if (transcript.isPending) return <Loading label="Loading the messages" />;
  if (transcript.isError || transcript.data.length === 0) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-xl border border-dashed border-input px-[18px] py-4">
        <span className="font-semibold">The messages could not be read</span>
        <span className="text-[13px] leading-[1.5] text-muted-foreground">
          {transcript.isError && transcript.error instanceof Error ? `${transcript.error.message}. ` : ""}
          The session is still in memory and still searchable. Its full transcript is read from the tool's own files, which may be on another machine.
        </span>
        <Button className="w-fit" size="md" onClick={() => void transcript.refetch()}>Try again</Button>
      </div>
    );
  }
  const inRange = (t: TranscriptTurn) => !!range && t.index >= range[0] && t.index <= range[1];
  const hit0 = (t: TranscriptTurn) => !!range && t.index === range[0];
  return (
    <div aria-label="Transcript" role="log" className="flex flex-col gap-2.5">
      {range && (
        <p className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground">
          Showing messages {rangeLabel(range)} from the summary. <Link to="." search={{ tab: "transcript" } as never}>Clear</Link>
        </p>
      )}
      {groupTurns(transcript.data).map((group) => {
        if (group.kind === "steps" && !group.turns.some(inRange)) {
          return (
            <details key={group.turns[0]!.index} className="text-[13px] text-muted-foreground">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">› {group.turns.length} steps</summary>
              <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 pl-3">
                {group.turns.flatMap((t) => t.parts).map((p, i) => <li key={i}>{p.kind === "tool" ? p.summary : ""}</li>)}
              </ul>
            </details>
          );
        }
        return group.turns.map((t) => <Turn key={t.index} t={t} hit={inRange(t)} first={hit0(t) ? first : undefined} phone={phone} />);
      })}
    </div>
  );
}

type TurnGroup = { kind: "turn" | "steps"; turns: TranscriptTurn[] };

/** Runs of two or more tool-only turns fold into one "N steps" line. */
function groupTurns(turns: TranscriptTurn[]): TurnGroup[] {
  const out: TurnGroup[] = [];
  for (const t of turns) {
    const toolOnly = t.parts.every((p) => p.kind === "tool");
    const last = out.at(-1);
    if (toolOnly && last?.kind === "steps") last.turns.push(t);
    else out.push({ kind: toolOnly ? "steps" : "turn", turns: [t] });
  }
  return out.map((g) => (g.kind === "steps" && g.turns.length < 2 ? { ...g, kind: "turn" } : g));
}

function Turn({ t, hit, first, phone }: { t: TranscriptTurn; hit: boolean; first: React.Ref<HTMLDivElement> | undefined; phone: boolean | undefined }) {
  const text = t.parts.filter((p) => p.kind === "text");
  const tools = t.parts.filter((p) => p.kind === "tool");
  return (
    <div
      ref={first}
      id={`m${t.index}`}
      className={cx("flex scroll-mt-4 flex-col gap-1", t.role === "user" ? "items-end" : "items-stretch", hit && "rounded-lg border-l-2 border-primary py-1 pl-2.5")}
      style={hit ? { background: "color-mix(in srgb, var(--primary) 6%, transparent)" } : undefined}
    >
      {!phone && <span className="text-[11px] text-muted-foreground">#{t.index} · {t.role === "user" ? "You" : "Agent"} · {time(t.at)}</span>}
      {text.map((p, i) => (
        <p key={i} className={cx("m-0 leading-[1.55]", t.role === "user" && "max-w-[85%] rounded-2xl bg-message-surface px-3.5 py-2.5")}>
          {p.kind === "text" && p.text}
        </p>
      ))}
      {tools.map((p, i) => (
        <span key={i} className="text-[13px] text-muted-foreground">› {p.kind === "tool" && p.summary}</span>
      ))}
    </div>
  );
}

function Changes({ d }: { d: SessionDetail }) {
  if (!d.changed.length) return <span className="text-muted-foreground">Nothing changed in memory.</span>;
  return (
    <>
      {d.changed.map((c, i) => (
        <span key={i} className="flex gap-2 leading-[1.45]">
          <span className="w-12 flex-none text-[11px] font-semibold" style={{ color: changeKind[c.kind].color }}>{changeKind[c.kind].label}</span>
          <span><Link to={subjectHref(c.subject)}>{c.subject.title}</Link> {c.text}</span>
        </span>
      ))}
    </>
  );
}

const NEW_TOPIC = "__new__";

function TopicPicker({ d, className, onPicked }: { d: SessionDetail; className?: string; onPicked?: () => void }) {
  const client = useClient();
  const tree = useTopicTree().data ?? [];
  const place = usePlaceSession();
  const create = useCreateTopic();
  const [name, setName] = useState<string | null>(null);
  const options = flattenTopics(tree);
  const save = () => {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return setName(null);
    create.mutate({ name: trimmed }, { onSuccess: (id) => { place.mutate({ session: d.id, topic: id }); setName(null); onPicked?.(); } });
  };
  if (name !== null) {
    return (
      <span className="flex flex-col gap-1.5">
        <span className="flex gap-1.5">
          <input
            autoFocus
            aria-label="New topic name"
            placeholder="Topic name"
            value={name}
            disabled={create.isPending}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setName(null);
            }}
            className={cx("min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-foreground outline-none focus:border-primary", className)}
          />
          <Button variant="primary" size="md" disabled={create.isPending || !name.trim()} onClick={save}>File</Button>
        </span>
        {create.isError && <span role="alert" className="text-[12px] text-error">{create.error instanceof Error ? create.error.message : "Could not create the topic."}</span>}
      </span>
    );
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="sr-only">Filed under</span>
      <select
        value={d.topic?.id ?? ""}
        onChange={(e) => {
          if (e.target.value === NEW_TOPIC) return setName("");
          place.mutate({ session: d.id, topic: (e.target.value || null) as TopicId | null });
          onPicked?.();
        }}
        className={cx(selectCls, className)}
      >
        <option value="">Unfiled</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        {client.createTopic && <option value={NEW_TOPIC}>New topic…</option>}
      </select>
      {place.isError && <span role="alert" className="text-[12px] text-error">The session was not moved{place.error instanceof Error ? `: ${place.error.message}` : ""}.</span>}
    </label>
  );
}

function VisibilityPicker({ d, className, onPicked }: { d: SessionDetail; className?: string; onPicked?: () => void }) {
  const set = useSetVisibility();
  const spaces = [...new Set([...(d.visibility.kind === "space" ? [d.visibility.space] : []), "household"])];
  return (
    <label className="flex flex-col">
      <span className="sr-only">Shared with</span>
      <select
        value={visibilityKey(d.visibility)}
        onChange={(e) => {
          const v = e.target.value;
          set.mutate({ id: d.id, visibility: v === "private" ? { kind: "private" } : { kind: "space", space: v.slice(6) } });
          if (v !== "private") markStep("share");
          onPicked?.();
        }}
        className={cx(selectCls, className)}
      >
        <option value="private">Private</option>
        {spaces.map((s) => <option key={s} value={`space:${s}`}>{s}</option>)}
      </select>
    </label>
  );
}

function TagEditor({ d }: { d: SessionDetail }) {
  const tag = useTag();
  const [draft, setDraft] = useState<string | null>(null);
  const op = (t: { key: string; value: string }, o: "accept" | "reject" | "add") => tag.mutate({ id: d.id, key: t.key, value: t.value, op: o });
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Tags tags={d.tags} onAccept={(t) => op(t, "accept")} onReject={(t) => op(t, "reject")} />
      {draft === null ? (
        <button type="button" onClick={() => setDraft("")} className="rounded-md border border-dashed border-input px-2 py-0.5 text-[12px] text-muted-foreground">+ tag</button>
      ) : (
        <input
          autoFocus
          aria-label="New tag, as key: value"
          placeholder="key: value"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDraft(null);
            if (e.key === "Enter") {
              const [key, ...rest] = draft.split(":");
              if (key?.trim() && rest.join(":").trim()) op({ key: key.trim(), value: rest.join(":").trim() }, "add");
              setDraft(null);
            }
          }}
          className="w-28 rounded-md border border-input bg-background px-1.5 py-0.5 text-[12px] text-foreground outline-none"
        />
      )}
    </span>
  );
}

function SessionSide({ d }: { d: SessionDetail }) {
  const canSend = useShareClient() !== null;
  return (
    <aside aria-label="What this session changed" className="flex w-[320px] min-w-0 flex-col gap-[18px] border-l border-border px-4 py-5 text-[13px]">
      <section className="flex flex-col gap-1.5">
        <Eyebrow>What it changed</Eyebrow>
        <Changes d={d} />
      </section>
      <section className="flex flex-col gap-1.5">
        <Eyebrow>Filed under</Eyebrow>
        <TopicPicker d={d} />
      </section>
      <section className="flex flex-col gap-1.5">
        <Eyebrow>Shared with</Eyebrow>
        <VisibilityPicker d={d} />
        <span className="text-[12px] leading-[1.45] text-muted-foreground">
          {d.visibility.kind === "private" ? "Only you can see this session." : `Everyone in ${d.visibility.space} can find it.`}{" "}
          {canSend ? <Link to="/share" search={{ session: d.id }}>Send to another RivetHub</Link> : <Link to="/shared">How sharing works</Link>}
        </span>
      </section>
      {d.entities.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Eyebrow>Entities mentioned</Eyebrow>
          <span className="flex flex-wrap gap-1.5">{d.entities.map((e) => <Chip key={e.id} to={`/entities/${e.id}`}>{e.title}</Chip>)}</span>
        </section>
      )}
      <section className="flex flex-col gap-1.5">
        <Eyebrow>Tags</Eyebrow>
        <TagEditor d={d} />
      </section>
    </aside>
  );
}

function PhoneActions({ d, onTrash, onRestore }: { d: SessionDetail; onTrash: () => void; onRestore: () => void }) {
  const keep = useKeep();
  const [sheet, setSheet] = useState<"file" | "share" | null>(null);
  const btn = "flex min-h-12 flex-col items-center justify-center gap-0.5 border-0 bg-transparent text-[12px]";
  return (
    <div className="grid shrink-0 grid-cols-4 gap-1.5 border-t border-border bg-sidebar px-3 pt-2 pb-[max(env(safe-area-inset-bottom),24px)]">
      <button type="button" className={btn} onClick={() => setSheet("file")}><FolderIcon size={20} />File</button>
      <button type="button" className={btn} onClick={() => setSheet("share")}><ShareIcon size={20} />Share</button>
      <button type="button" className={cx(btn, d.kept && "text-primary")} aria-pressed={d.kept} onClick={() => keep.mutate({ id: d.id, keep: !d.kept })}><KeepIcon size={20} />{d.kept ? "Kept" : "Keep"}</button>
      {d.trashed ? (
        <button type="button" className={btn} onClick={onRestore}><TrashIcon size={20} />Restore</button>
      ) : (
        <button type="button" className={cx(btn, "text-error")} onClick={onTrash}><TrashIcon size={20} />Trash</button>
      )}
      {sheet && (
        <Modal label={sheet === "file" ? "File this session" : "Share this session"} placement="sheet" onClose={() => setSheet(null)} className="gap-3 px-4">
          <span className="text-[17px] font-semibold">{sheet === "file" ? "File under" : "Shared with"}</span>
          {sheet === "file" ? <TopicPicker d={d} className="min-h-12 text-[16px]" onPicked={() => setSheet(null)} /> : <VisibilityPicker d={d} className="min-h-12 text-[16px]" onPicked={() => setSheet(null)} />}
        </Modal>
      )}
    </div>
  );
}
