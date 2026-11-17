import { SubjectType } from "../components/subject-type";
import { reviewText, dayLabel, primaryAction, shortDate } from "@rivethub/client-runtime/format";
import type { ReviewDecision, ReviewItem } from "@rivethub/contracts";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { DECISION_FAILED, useDecide, useReviewQueue } from "../client/queries";
import { Frame, HubChip, MainSidebar } from "../components/shell";
import { Button, cx, ErrorNote, KindTag, Loading, SampleBadge } from "../components/ui";
import { reviewGroups, reviewKindLabel, subjectHref } from "../lib/format";
import { useIsPhone } from "../lib/media";

const route = getRouteApi("/review");
const FILTERS = ["All", "Other", ...new Set(reviewGroups.map((g) => g.filter))] as const;

/** The decision the main button and the A key make. */
function primaryDecision(item: ReviewItem): ReviewDecision {
  const first = item.options?.[0];
  return item.group === "conflict" && first ? { kind: "choose", value: first.value } : { kind: "accept" };
}

function editSeed(item: ReviewItem): string {
  return item.group === "conflict" ? (item.options?.[0]?.value ?? "") : (item.after ?? item.text);
}

function useReviewModel() {
  const queue = useReviewQueue();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const items = queue.data ?? [];
  const groups = useMemo(
    () =>
      [...reviewGroups, { group: "tidy" as const, title: "Other", filter: "Other", color: "var(--muted-foreground)", hint: "This hub uses a newer review group." }]
        .filter((g) => filter === "All" || g.filter === filter)
        .map((g) => ({ ...g, items: items.filter((i) => g.filter === "Other" ? !!i.rawGroup : !i.rawGroup && i.group === g.group) }))
        .filter((g) => g.items.length > 0),
    [items, filter],
  );
  const visible = groups.flatMap((g) => g.items);
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "All" ? items.length : items.filter((i) => i.rawGroup ? f === "Other" : reviewGroups.find((g) => g.group === i.group)?.filter === f).length]));
  return { queue, filter, setFilter, groups, visible, counts, total: items.length };
}

export function ReviewPage() {
  const phone = useIsPhone();
  return phone ? <ReviewPhone /> : <ReviewDesktop />;
}

function FilterChips({ model, phone }: { model: ReturnType<typeof useReviewModel>; phone?: boolean }) {
  return (
    <div role="group" aria-label="Filter" className={cx("flex gap-1.5", phone ? "-mr-4 overflow-x-auto pr-4" : "flex-wrap")}>
      {FILTERS.filter((f) => f === "All" || model.counts[f]).map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={model.filter === f}
          onClick={() => model.setFilter(f)}
          className={cx("shrink-0 rounded-full border border-border text-foreground", phone ? "min-h-9 px-3 text-[13px]" : "px-2.5 py-1 text-[13px]", model.filter === f ? "bg-selected" : "bg-transparent")}
        >
          {f} <span style={{ color: f === "Conflicts" ? "var(--warning)" : "var(--muted-foreground)" }}>{model.counts[f]}</span>
        </button>
      ))}
    </div>
  );
}

function Diff({ item }: { item: ReviewItem }) {
  if (item.group === "conflict" || !item.after) return null;
  return (
    <span className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
      {item.before && <span className="rounded-md tint-error px-2 py-0.5 text-error line-through">{item.before}</span>}
      {item.before && <span aria-hidden="true">→</span>}
      <span className="rounded-md tint-success px-2 py-0.5 text-success">{item.after}</span>
    </span>
  );
}

function ReviewDesktop() {
  const model = useReviewModel();
  const { item: wanted } = route.useSearch();
  const decide = useDecide();
  const [selectedId, setSelectedId] = useState<string | undefined>(wanted);
  const [editing, setEditing] = useState<string | null>(null);
  const { visible } = model;
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0];
  const page = Math.floor(Math.max(0, visible.findIndex((i) => i.id === selected?.id)) / 50);
  const pageItems = new Set(visible.slice(page * 50, (page + 1) * 50));
  const cardRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (selected) cardRefs.current.get(selected.id)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  function run(item: ReviewItem, decision: ReviewDecision) {
    const at = visible.indexOf(item);
    const next = visible[at + 1] ?? visible[at - 1];
    setSelectedId(next?.id);
    setEditing(null);
    decide.mutate({ id: item.id, decision });
  }

  function acceptGroup(group: ReviewItem["group"]) {
    const items = visible.filter((i) => i.group === group && !i.rawGroup);
    const next = visible.find((i) => i.group !== group && visible.indexOf(i) > visible.indexOf(items.at(-1)!)) ?? visible.find((i) => i.group !== group);
    setSelectedId(next?.id);
    for (const i of items) decide.mutate({ id: i.id, decision: primaryDecision(i) });
  }

  const latest = useRef({ selected, visible, editing });
  latest.current = { selected, visible, editing };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const { selected: sel, visible: list, editing: ed } = latest.current;
      const target = e.target as HTMLElement;
      if (ed || e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, select, [role=dialog]")) return;
      if (!sel) return;
      if (sel.rawGroup && !["j", "k"].includes(e.key.toLowerCase())) return;
      if (!reviewGroups.some((g) => g.group === sel.group) && !["j", "k"].includes(e.key.toLowerCase())) return;
      const at = list.indexOf(sel);
      const key = e.key.toLowerCase();
      if (key === "j") setSelectedId(list[Math.min(at + 1, list.length - 1)]?.id);
      else if (key === "k") setSelectedId(list[Math.max(at - 1, 0)]?.id);
      else if (key === "a" && e.shiftKey) acceptGroup(sel.group);
      else if (key === "a") run(sel, primaryDecision(sel));
      else if (key === "r") run(sel, { kind: "reject" });
      else if (key === "e") setEditing(sel.id);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Frame sidebar={<MainSidebar />} aside={selected && <Evidence item={selected} />}>
      <header className="flex flex-col gap-3 border-b border-border px-6 pt-5 pb-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h1 className="m-0 flex flex-1 items-center gap-2 text-[20px] font-semibold">Review <SampleBadge capability="review" /></h1>
          <span className="text-[12px] text-muted-foreground">
            <kbd>J</kbd> <kbd>K</kbd> move · <kbd>A</kbd> accept · <kbd>E</kbd> edit · <kbd>R</kbd> reject · <kbd>⇧A</kbd> accept group
          </span>
        </div>
        <FilterChips model={model} />
        {decide.isError && <p role="alert" className="m-0 text-[13px] text-error">{DECISION_FAILED}</p>}
      </header>
      {model.queue.isPending ? (
        <Loading />
      ) : model.queue.isError ? (
        <ErrorNote error={model.queue.error} />
      ) : model.total === 0 ? (
        <p className="px-6 py-10 text-muted-foreground">Nothing to review. New proposals show up here as your agents work.</p>
      ) : (
        <div role="list" aria-label="Proposed changes" className="flex flex-1 flex-col gap-[18px] px-6 py-4">
          <nav aria-label="Review pages" className="flex items-center gap-3">
            <Button disabled={page === 0} onClick={() => setSelectedId(visible[(page - 1) * 50]?.id)}>Previous</Button>
            <span>{page + 1} of {Math.max(1, Math.ceil(visible.length / 50))}</span>
            <Button disabled={(page + 1) * 50 >= visible.length} onClick={() => setSelectedId(visible[(page + 1) * 50]?.id)}>Next</Button>
          </nav>
          {model.groups.filter((g) => g.items.some((i) => pageItems.has(i))).map((g) => (
            <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold tracking-[0.04em] uppercase" style={{ color: g.color }}>{g.title} ({g.items.length})</span>
                <span className="flex-1 text-[12px] text-muted-foreground">{g.hint}</span>
                {g.filter !== "Other" && g.group !== "conflict" && g.items.length > 1 && (
                  <Button size="xs" onClick={() => acceptGroup(g.group)}>
                    {g.group === "filing" ? "File" : "Accept"} all {g.items.length}
                  </Button>
                )}
              </div>
              {g.items.filter((i) => pageItems.has(i)).map((item) => {
                const open = item.id === selected?.id;
                return (
                  <article
                    key={item.id}
                    role="listitem"
                    ref={(el) => void (el ? cardRefs.current.set(item.id, el) : cardRefs.current.delete(item.id))}
                    aria-current={open || undefined}
                    aria-label={`${item.subject.title}: ${reviewText(item)}`}
                    onClick={() => setSelectedId(item.id)}
                    className={cx("flex cursor-default flex-col gap-2 rounded-[10px] border px-3.5 py-3", open ? "border-primary bg-card" : "border-border bg-transparent")}
                  >
                    <span className="flex flex-wrap items-baseline gap-2">
                      <Link to={subjectHref(item.subject)} className="font-semibold">{item.subject.title}</Link>{item.subject.kind === "entity" && <SubjectType subject={item.subject} />}
                      <span className="min-w-[180px] flex-1 leading-[1.45]">{reviewText(item)}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {item.group === "conflict" ? `${item.options?.length ?? 0} sessions` : item.group === "filing" || item.group === "tag" || item.group === "tidy" ? "categorizer" : `${dayLabel(item.createdAt).replace("Today", "today")} · ${item.evidence[0]?.session.title ?? ""}`}
                      </span>
                    </span>
                    {item.rawGroup && <span>{item.rawGroup}. Review this item in a client that supports it.</span>}
                    {open && !item.rawGroup && reviewGroups.some((g) => g.group === item.group) && (
                      <>
                        {item.group === "conflict" && item.options && item.options.length >= 2 && (
                          <span className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
                            <span className="rounded-md tint-error px-2 py-0.5 text-error line-through">{item.options[1]!.value}</span>
                            <span aria-hidden="true">→</span>
                            <span className="rounded-md tint-success px-2 py-0.5 text-success">{item.options[0]!.value}</span>
                          </span>
                        )}
                        <Diff item={item} />
                        {editing === item.id ? (
                          <EditRow item={item} onCancel={() => setEditing(null)} onSave={(value) => run(item, { kind: "edit", value })} />
                        ) : (
                          <span className="flex flex-wrap gap-1.5">
                            {item.group === "conflict" ? (
                              <>
                                {item.options?.map((o, i) => (
                                  <Button key={o.value} variant={i === 0 ? "primary" : "outline"} size="md" className="px-3" onClick={() => run(item, { kind: "choose", value: o.value })}>
                                    {i === 0 ? "Take" : "Keep"} {o.label}
                                  </Button>
                                ))}
                                <Button size="md" onClick={() => setEditing(item.id)}>Write my own…</Button>
                              </>
                            ) : (
                              <>
                                <Button variant="primary" size="md" onClick={() => run(item, primaryDecision(item))}>{primaryAction(item)}</Button>
                                <Button size="md" onClick={() => setEditing(item.id)}>Edit</Button>
                                <Button size="md" onClick={() => run(item, { kind: "reject" })}>Reject</Button>
                                <Button variant="ghost" size="md" onClick={() => run(item, { kind: "later" })}>Later</Button>
                              </>
                            )}
                          </span>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </Frame>
  );
}

function EditRow({ item, onSave, onCancel }: { item: ReviewItem; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(editSeed(item));
  return (
    <form
      className="flex flex-wrap gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSave(value.trim());
      }}
    >
      <label className="flex min-w-0 flex-1">
        <span className="sr-only">Your version</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-foreground outline-none focus:border-primary"
        />
      </label>
      <Button variant="primary" size="md" type="submit">Save</Button>
      <Button size="md" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

function Quote({ e, accent, surface = "var(--card)" }: { e: ReviewItem["evidence"][number]; accent: string; surface?: string }) {
  const parts = e.highlight ? e.quote.split(e.highlight) : [e.quote];
  return (
    <blockquote className="m-0 rounded-md border-l-[3px] px-3 py-2.5 leading-[1.55]" style={{ borderLeftColor: accent, background: surface }}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <mark className="rounded-sm" style={{ background: `color-mix(in srgb, ${accent === "var(--border)" ? "var(--info)" : accent} 28%, transparent)` }}>{e.highlight}</mark>}
        </span>
      ))}
    </blockquote>
  );
}

function Evidence({ item }: { item: ReviewItem }) {
  const sorted = [...item.evidence].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <aside aria-label="Evidence" className="flex w-[360px] min-w-0 flex-col gap-4 border-l border-border px-[18px] py-[22px]">
      <span className="text-[12px] font-semibold text-muted-foreground">EVIDENCE</span>
      {sorted.map((e, i) => (
        <div key={`${e.session.id}-${i}`} className="flex flex-col gap-1.5 text-[13px]">
          <span className="text-muted-foreground">
            <Link to="/sessions/$sessionId" params={{ sessionId: e.session.id }}>{e.session.title}</Link> · {shortDate(e.at)}
            {sorted.length > 1 && i === 0 && " · newer"}
          </span>
          <Quote e={e} accent={i === 0 ? "var(--success)" : "var(--border)"} />
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-muted-foreground">AFFECTS</span>
        <span className="text-[13px] leading-[1.5]">
          <Link to={subjectHref(item.subject)}>{item.subject.title}</Link>{item.subject.kind === "entity" && <SubjectType subject={item.subject} />}
          {item.group === "conflict" || item.group === "fact" ? ` › ${reviewText(item)}` : ""}
        </span>
      </div>
      <span className="text-[12px] leading-[1.5] text-muted-foreground">Everything you accept here shows up in Today and in each article's History, with you as the author.</span>
    </aside>
  );
}

function ReviewPhone() {
  const model = useReviewModel();
  const decide = useDecide();
  const item = model.visible[0];
  const [choice, setChoice] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [done, setDone] = useState(0);
  const seen = done + model.total;

  useEffect(() => {
    setChoice(item?.options?.[0]?.value);
    setEditing(false);
    setDx(0);
  }, [item?.id]);

  function primary(it: ReviewItem): ReviewDecision {
    return it.group === "conflict" && choice ? { kind: "choose", value: choice } : primaryDecision(it);
  }
  function go(decision: ReviewDecision) {
    if (!item || item.rawGroup) return;
    if (decision.kind !== "later") setDone((d) => d + 1);
    decide.mutate({ id: item.id, decision });
  }

  const label = item?.group === "conflict" ? `Take ${item.options?.find((o) => o.value === choice)?.label ?? ""}` : item ? primaryAction(item) : "";

  return (
    <Frame sidebar={null} tabs>
      <header className="flex flex-col gap-2.5 px-4 pt-4 pb-2.5">
        <div className="flex items-center gap-2.5">
          <h1 className="m-0 text-[22px] font-semibold">Review</h1>
          <span className="flex-1 text-[13px] text-muted-foreground">{model.total ? `${done + 1} of ${seen}` : ""}</span>
          <HubChip />
        </div>
        <div className="h-1 rounded-sm bg-card" role="progressbar" aria-label="Reviewed" aria-valuemin={0} aria-valuemax={seen} aria-valuenow={done}>
          <div className="h-1 rounded-sm bg-primary" style={{ width: `${seen ? Math.max(4, ((done + 1) / seen) * 100) : 0}%` }} />
        </div>
        <FilterChips model={model} phone />
        <SampleBadge capability="review" />
        {decide.isError && <p role="alert" className="m-0 text-[13px] text-error">{DECISION_FAILED}</p>}
      </header>
      {model.queue.isPending ? (
        <Loading />
      ) : !item ? (
        <p className="px-4 py-10 text-center text-muted-foreground">All caught up.</p>
      ) : (
        <>
          <div className="relative flex-1 px-4 pt-1.5">
            {model.visible.length > 1 && <div aria-hidden="true" className="absolute top-[18px] right-7 left-7 h-[360px] rounded-[18px] bg-card opacity-45" />}
            <article
              aria-label={`${reviewKindLabel[item.group].label}: ${item.subject.title}`}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button, a, input, label, summary")) return;
                drag.current = { x: e.clientX, id: e.pointerId };
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={(e) => drag.current && setDx(e.clientX - drag.current.x)}
              onPointerUp={() => {
                if (!drag.current) return;
                drag.current = null;
                if (dx > 90) go(primary(item));
                else if (dx < -90) go({ kind: "later" });
                setDx(0);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDx(0);
              }}
              className="relative flex touch-pan-y flex-col gap-3 rounded-[18px] border bg-card p-[18px] transition-transform select-none"
              style={{
                borderColor: item.group === "conflict" ? "color-mix(in srgb, var(--warning) 50%, transparent)" : "var(--border)",
                transform: `translateX(${dx}px) rotate(${dx / 30}deg)`,
                transitionDuration: drag.current ? "0ms" : undefined,
              }}
            >
              <span className="flex items-center gap-2">
                <KindTag {...reviewKindLabel[item.group]} />
                <Link to={subjectHref(item.subject)} className="font-semibold">{item.subject.title}</Link>{item.subject.kind === "entity" && <SubjectType subject={item.subject} />}
              </span>
              <span className="text-[18px] leading-[1.35] font-semibold">{item.group === "conflict" ? `Which ${reviewText(item).toLowerCase()} is right?` : reviewText(item)}</span>
              {item.group === "conflict" && item.options && (
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="sr-only">Pick a value</legend>
                  {item.options.map((o) => (
                    <label
                      key={o.value}
                      className={cx("flex min-h-12 items-center gap-2.5 rounded-xl px-3", choice === o.value ? "border-2 border-primary" : "border border-border")}
                      style={choice === o.value ? { background: "color-mix(in srgb, var(--primary) 10%, transparent)" } : undefined}
                    >
                      <input type="radio" name="choice" checked={choice === o.value} onChange={() => setChoice(o.value)} className="size-[18px] accent-primary" />
                      <span className="flex-1">
                        {o.value.startsWith(o.label) ? <><b className="font-semibold">{o.label}</b>{o.value.slice(o.label.length)}</> : o.value}
                      </span>
                      {o.source && <span className="text-[12px] text-muted-foreground">{shortDate(o.source.at)}{o.source.at === item.options?.[0]?.source?.at ? " · newer" : ""}</span>}
                    </label>
                  ))}
                </fieldset>
              )}
              {item.group !== "conflict" && <Diff item={item} />}
              {editing && <EditRow item={item} onCancel={() => setEditing(false)} onSave={(value) => go({ kind: "edit", value })} />}
              <details open className="border-t border-border pt-2.5">
                <summary className="min-h-8 cursor-pointer text-[14px] text-muted-foreground">Why? {item.evidence.length} session{item.evidence.length === 1 ? "" : "s"}</summary>
                {item.evidence.slice(0, 1).map((e, i) => (
                  <div key={i} className="mt-2 text-[14px]">
                    <Quote e={e} accent="var(--success)" surface="var(--background)" />
                    <Link to="/sessions/$sessionId" params={{ sessionId: e.session.id }} className="mt-1.5 block text-[13px]">{e.session.title} · {shortDate(e.at)}</Link>
                  </div>
                ))}
              </details>
            </article>
            <div aria-hidden="true" className="flex justify-between px-1.5 pt-3.5 text-[13px]">
              <span className="text-error">← Swipe to skip</span>
              <span className="text-success">Swipe to accept →</span>
            </div>
          </div>
          {item.rawGroup ? <p className="px-4 text-muted-foreground">{item.rawGroup}. Review this item in a client that supports it.</p> : <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2 px-4 py-2.5">
            <Button size="lg" onClick={() => go({ kind: "later" })}>Later</Button>
            <Button size="lg" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="lg" variant="primary" className="font-semibold" onClick={() => go(primary(item))}>{label}</Button>
          </div>}
        </>
      )}
    </Frame>
  );
}
