import type { SessionDetail, SessionId, SessionQuery, SessionSummaryRow, SummaryNode, TopicId, TopicNode, TranscriptTurn, Visibility } from "@rivethub/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useKeep, useLibraryCounts, usePlaceSession, useRenameSession, useRestore, useSession, useSessions, useSetVisibility, useSummaryTree, useTag, useTopicTree, useTranscript, useTrash } from "../client/queries";
import { ArticleBar, ArticleTabs, Crumbs, MobileBack } from "../components/article";
import { EditableText } from "../components/editable";
import { FolderIcon, KeepIcon, ShareIcon, TrashIcon } from "../components/icons";
import { LibraryPhone } from "../components/library";
import { Modal } from "../components/modal";
import { Frame, Logo } from "../components/shell";
import { Button, Chip, cx, ErrorNote, Eyebrow, KindTag, Loading, SampleBadge, Tags } from "../components/ui";
import { changeKind, count, dayLabel, harnessNames, longDay, localDay, shortDate, subjectHref, time } from "../lib/format";
import { useIsPhone } from "../lib/media";

const route = getRouteApi("/sessions/$sessionId");
const indexRoute = getRouteApi("/sessions");
type View = NonNullable<SessionQuery["view"]>;

function flattenTopics(nodes: TopicNode[], trail: string[] = []): { id: TopicId; label: string }[] {
  return nodes.flatMap((n) => [{ id: n.id, label: [...trail, n.name].join(" › ") }, ...flattenTopics(n.children, [...trail, n.name])]);
}

function SessionList({ view, text, selected, phone }: { view: View; text: string; selected?: string; phone?: boolean }) {
  const list = useSessions({ view, ...(text ? { text } : {}) });
  const groups = useMemo(() => {
    const out: { day: string; items: SessionSummaryRow[] }[] = [];
    for (const s of list.data?.items ?? []) {
      const day = localDay(new Date(s.startedAt));
      const last = out.at(-1);
      if (last?.day === day) last.items.push(s);
      else out.push({ day, items: [s] });
    }
    return out;
  }, [list.data]);
  if (list.isPending) return <Loading />;
  if (!groups.length) return <p className="px-2.5 py-4 text-[13px] text-muted-foreground">No sessions here.</p>;
  return (
    <>
      {groups.map((g) => (
        <section key={g.day} aria-label={longDay(g.day)} className="flex flex-col gap-0.5">
          <span className="px-2.5 pt-2 pb-0.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {dayLabel(`${g.day}T12:00`) === "Today" ? "Today" : longDay(g.day).split(", ").slice(1).join(", ")}
          </span>
          {g.items.map((s) => (
            <Link
              key={s.id}
              to="/sessions/$sessionId"
              params={{ sessionId: s.id }}
              search={view === "all" ? {} : { view }}
              aria-current={s.id === selected ? "page" : undefined}
              className={cx("flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-foreground hover:no-underline", s.id === selected ? "bg-selected" : "hover:bg-accent", phone && "min-h-14")}
            >
              <span className="flex justify-between text-[12px] text-muted-foreground"><span>{s.harness}</span><span>{time(s.startedAt)}</span></span>
              <span className="truncate">{s.title}</span>
              {s.childCount ? <span className="text-[12px] text-muted-foreground">{subagents(s.childCount)}</span> : null}
              <span className="text-[12px]" style={{ color: s.topic ? "var(--muted-foreground)" : "var(--warning)" }}>{s.topic ? s.topic.path.slice(-2).join(" › ") : "Unfiled"}</span>
            </Link>
          ))}
        </section>
      ))}
    </>
  );
}

function SessionFilters({ view, onView, text, onText, phone }: { view: View; onView: (v: View) => void; text: string; onText: (t: string) => void; phone?: boolean }) {
  const unfiled = useSessions({ view: "unfiled" }).data?.items.length;
  const views: { id: View; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unfiled", label: `Unfiled${unfiled ? ` ${unfiled}` : ""}` },
    { id: "kept", label: "Kept" },
    { id: "trash", label: "Trash" },
  ];
  return (
    <>
      <label className={cx("flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-muted-foreground", phone ? "min-h-11" : "py-1.5")}>
        <span className="sr-only">Filter sessions</span>
        <input value={text} onChange={(e) => onText(e.target.value)} placeholder="Filter by title, harness, topic…" className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
      </label>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-1 px-0.5 py-1.5">
        {views.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => onView(v.id)} className={cx("rounded-full border border-border px-2 text-[12px] text-foreground", phone ? "min-h-9 px-3" : "py-[3px]", view === v.id ? "bg-selected" : "bg-transparent")}>
            {v.label}
          </button>
        ))}
      </div>
    </>
  );
}

function SessionsSidebar({ selected, view }: { selected?: string; view: View }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const listed = useSessions({ view: "all" }).data?.items.length;
  const total = useLibraryCounts().data?.sessions ?? listed;
  return (
    <nav aria-label="Sessions" className="flex w-[300px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-sidebar px-2 py-2.5">
      <div className="flex items-center gap-2 px-2 pt-1 pb-2.5">
        <Link to="/" aria-label="Back to Today" className="hover:no-underline"><Logo /></Link>
        <span className="flex-1 font-semibold">Sessions</span>
        {total !== undefined && <span className="text-[12px] text-muted-foreground">{count(total)}</span>}
      </div>
      <SessionFilters view={view} text={text} onText={setText} onView={(v) => void navigate({ to: selected ? "/sessions/$sessionId" : "/sessions", params: { sessionId: selected ?? "" }, search: { view: v } })} />
      <SessionList view={view} text={text} {...(selected ? { selected } : {})} />
    </nav>
  );
}

export function SessionsIndex() {
  const { view = "all" } = indexRoute.useSearch();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const [text, setText] = useState("");
  if (phone) {
    return (
      <Frame sidebar={null} tabs>
        <LibraryPhone kind="sessions">
          <div className="px-2">
            <SessionFilters phone view={view} text={text} onText={setText} onView={(v) => void navigate({ to: "/sessions", search: { view: v } })} />
          </div>
          <SessionList phone view={view} text={text} />
        </LibraryPhone>
      </Frame>
    );
  }
  return (
    <Frame sidebar={<SessionsSidebar view={view} />}>
      <div className="m-auto flex max-w-md flex-col items-center gap-2 p-8 text-center">
        <h1 className="m-0 flex items-center gap-2 font-serif text-[28px] font-semibold">Sessions <SampleBadge capability="sessions" /></h1>
        <p className="m-0 text-muted-foreground">Every conversation your agents had, as captured. Pick one to read its summary or the full transcript.</p>
      </div>
    </Frame>
  );
}

const selectCls =
  "w-full appearance-none rounded-lg border border-input bg-card bg-[length:10px] bg-[right_10px_center] bg-no-repeat py-1.5 pr-7 pl-2.5 text-foreground bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0h10L5 6z' fill='%239da9a0'/%3E%3C/svg%3E\")]";

const visibilityKey = (v: Visibility) => (v.kind === "private" ? "private" : `space:${v.space}`);

export function SessionPage() {
  const { sessionId } = route.useParams();
  const search = route.useSearch();
  const phone = useIsPhone();
  const tab = search.tab ?? (phone ? "transcript" : "summary");
  const s = useSession(sessionId as SessionId);
  const keep = useKeep();
  const trash = useTrash();
  const restore = useRestore();
  const navigate = useNavigate();
  const range: [number, number] | undefined = search.from !== undefined ? [search.from, search.to ?? search.from] : undefined;
  const d = s.data;
  const tabs = [
    { id: "transcript" as const, label: "Transcript", count: d?.messageCount ?? 0 },
    { id: "summary" as const, label: "Summary" },
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
    <Frame sidebar={<SessionsSidebar selected={sessionId} view={search.view ?? "all"} />} aside={d && <SessionSide d={d} />}>
      {fallback ?? (
        <>
          <ArticleBar crumbs={<Crumbs items={[{ label: "Sessions", to: "/sessions" }, { label: d!.title }]} />}>
            <ArticleTabs tabs={tabs} active={tab} search={(id) => ({ ...search, tab: id, from: undefined, to: undefined })} />
            <Button className="ml-2" aria-pressed={d!.kept} onClick={() => keep.mutate({ id: d!.id, keep: !d!.kept })}>{d!.kept ? "Kept" : "Keep"}</Button>
            {d!.trashed ? (
              <Button onClick={() => restore.mutate([d!.id])} disabled={restore.isPending}>Restore</Button>
            ) : (
              <Button variant="danger" onClick={doTrash}>Trash</Button>
            )}
          </ArticleBar>
          <div className="flex flex-1 flex-col gap-[18px] px-8 py-6">
            <SessionHeader d={d!} />
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
        <span className="text-[13px] text-muted-foreground">
          {harnessNames[d.harness] ?? d.harness} · {shortDate(d.startedAt)}, {time(d.startedAt)}
          {d.endedAt ? `–${time(d.endedAt)}` : ""} · {d.messageCount} messages{d.cwd ? ` · ` : ""}
          {d.cwd && <span className="font-mono text-[12px]">{d.cwd}</span>}
        </span>
        {d.childCount ? <span className="text-[13px] text-muted-foreground">{subagents(d.childCount)}</span> : null}
      </div>
      {d.resumeCommand && (
        <>
          <code className="rounded-md bg-code px-2 py-1 font-mono text-[12px]">{d.resumeCommand}</code>
          <CopyButton text={d.resumeCommand} label="Copy resume" className="rounded-md bg-primary px-2.5 py-1 text-[12px] text-primary-foreground" />
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

function SummaryView({ id }: { id: SessionId }) {
  const tree = useSummaryTree(id);
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  if (tree.isPending) return <Loading />;
  if (tree.isError) return <ErrorNote error={tree.error} />;
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
          <div key={i} className="ml-[18px] grid grid-cols-[70px_minmax(0,1fr)_auto] items-baseline gap-2.5 border-l-2 border-border px-2.5 py-1.5">
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
  if (transcript.isPending) return <Loading />;
  if (transcript.isError) return <ErrorNote error={transcript.error} />;
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

function TopicPicker({ d, className, onPicked }: { d: SessionDetail; className?: string; onPicked?: () => void }) {
  const tree = useTopicTree().data ?? [];
  const place = usePlaceSession();
  const options = flattenTopics(tree);
  return (
    <label className="flex flex-col">
      <span className="sr-only">Filed under</span>
      <select
        value={d.topic?.id ?? ""}
        onChange={(e) => {
          place.mutate({ session: d.id, topic: (e.target.value || null) as TopicId | null });
          onPicked?.();
        }}
        className={cx(selectCls, className)}
      >
        <option value="">Unfiled</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
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
  return (
    <aside aria-label="What this session changed" className="flex w-[320px] min-w-0 flex-col gap-[18px] border-l border-border bg-sidebar px-4 py-5 text-[13px]">
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
