import { dayLabel, entityTypeLabel, groupEntities, localDay, parseDay, shortDate, time } from "@rivethub/client-runtime/format";
import type { ChangeKind, EntityArticle, EntityId, EntitySummary, EntityType, Fact, IsoTime } from "@rivethub/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChanges, useEntities, useEntity, useReviewQueue, useSetFact } from "../client/queries";
import { ArticleBar, ArticleBody, ArticleTabs, Crumbs, H2, MobileBack, SessionRows, type Tab } from "../components/article";
import { PinIcon } from "../components/icons";
import { LibraryPhone } from "../components/library";
import { articleBody, Markdown } from "../components/markdown";
import { Modal } from "../components/modal";
import { PinButton } from "../components/pin";
import { SearchIcon } from "../components/icons";
import { Frame, MainSidebar } from "../components/shell";
import { Button, cx, ErrorNote, Loading, SampleBadge, Tags } from "../components/ui";
import { changeKind, factLabel, plural, reviewText } from "../lib/format";
import { useIsPhone } from "../lib/media";
import { EmptyLibrary, visibilityLabel } from "./topic";

const route = getRouteApi("/entities/$entityId");
type TabId = "overview" | "sessions" | "history";

const SIDEBAR_SHOWN = 14;

/** A window of the list around the open entity, so its neighbors are one click away without listing hundreds. */
function nearby(items: EntitySummary[], id: string): EntitySummary[] {
  if (items.length <= SIDEBAR_SHOWN) return items;
  const at = Math.max(0, items.findIndex((e) => e.id === id));
  const start = Math.min(Math.max(0, at - Math.floor(SIDEBAR_SHOWN / 2)), items.length - SIDEBAR_SHOWN);
  return items.slice(start, start + SIDEBAR_SHOWN);
}

function EntityKinds({ selected }: { selected?: EntitySummary }) {
  const list = useEntities().data ?? [];
  return (
    <>
      {groupEntities(list).map((g) => (
        <div key={g.type} className="flex flex-col">
          <Link to="/entities" hash={g.type} className="flex justify-between rounded-lg px-2.5 py-[5px] text-foreground hover:bg-accent hover:no-underline">
            <span>{g.label}</span>
            <span className="text-[12px] text-muted-foreground">{g.items.length}</span>
          </Link>
          {selected?.type === g.type &&
            nearby(g.items, selected.id).map((e) => (
              <Link
                key={e.id}
                to="/entities/$entityId"
                params={{ entityId: e.id }}
                aria-current={e.id === selected.id ? "page" : undefined}
                className={cx("truncate rounded-lg py-[5px] pr-2.5 pl-[22px] text-[13px] text-foreground hover:no-underline", e.id === selected.id ? "bg-selected" : "hover:bg-accent")}
              >
                {e.title}
              </Link>
            ))}
          {selected?.type === g.type && g.items.length > SIDEBAR_SHOWN && (
            <Link to="/entities" hash={g.type} className="py-[5px] pr-2.5 pl-[22px] text-[12px]">All {g.items.length} {g.label}</Link>
          )}
        </div>
      ))}
    </>
  );
}

type EntitySort = "name" | "sessions";

export function EntitiesIndex() {
  const phone = useIsPhone();
  const list = useEntities();
  const [text, setText] = useState("");
  const [only, setOnly] = useState<EntityType | "">("");
  const [sort, setSort] = useState<EntitySort>("name");
  const all = list.data ?? [];
  const types = groupEntities(all);
  const needle = text.trim().toLowerCase();
  const shown = all
    .filter((e) => (!only || e.type === only) && (!needle || e.title.toLowerCase().includes(needle)))
    .sort((x, y) => (sort === "sessions" ? y.sessionCount - x.sessionCount : 0) || x.title.localeCompare(y.title, undefined, { sensitivity: "base" }));
  const groups = types.map((g) => ({ ...g, items: shown.filter((e) => e.type === g.type) })).filter((g) => g.items.length > 0);
  const chip = (on: boolean) => cx("rounded-full border px-2.5 text-[12px]", phone ? "min-h-9 px-3" : "py-1", on ? "border-transparent bg-selected text-foreground" : "border-border bg-transparent text-muted-foreground hover:text-foreground");

  const controls = all.length > 0 && (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={cx("flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-muted-foreground", phone ? "min-h-11" : "py-1.5")}>
          <SearchIcon size={14} />
          <span className="sr-only">Filter entities</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Filter ${all.length.toLocaleString("en-US")} entities…`} className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
        <label className="flex flex-col">
          <span className="sr-only">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as EntitySort)} className={cx("appearance-none rounded-lg border border-input bg-card bg-[url(/icons/select-chevron.svg)] bg-[length:10px] bg-[right_10px_center] bg-no-repeat py-1.5 pr-7 pl-2.5 text-foreground", phone && "min-h-11")}>
            <option value="name">A to Z</option>
            <option value="sessions">Most sessions</option>
          </select>
        </label>
      </div>
      <div role="group" aria-label="Type" className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={only === ""} onClick={() => setOnly("")} className={chip(only === "")}>All {all.length.toLocaleString("en-US")}</button>
        {types.map((g) => (
          <button key={g.type} type="button" aria-pressed={only === g.type} onClick={() => setOnly(only === g.type ? "" : g.type)} className={chip(only === g.type)}>
            {g.label} {g.items.length}
          </button>
        ))}
      </div>
    </div>
  );

  const rows = groups.map((g) => (
    <section key={g.type} id={g.type} aria-label={g.label} className="flex flex-col">
      <h2 className="m-0 px-2 pt-4 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{g.label} <span className="font-normal">{g.items.length}</span></h2>
      {g.items.map((e) => (
        <Link key={e.id} to="/entities/$entityId" params={{ entityId: e.id }} className="flex min-h-12 items-center gap-2.5 border-b border-border px-3 text-foreground hover:bg-accent hover:no-underline md:min-h-10">
          <span className="min-w-0 flex-1 truncate">{e.title}</span>
          {e.sessionCount > 0 && <span className="text-[12px] text-muted-foreground">{plural(e.sessionCount, "session")}</span>}
          <span className="text-muted-foreground">›</span>
        </Link>
      ))}
    </section>
  ));
  const body = list.isPending ? <Loading /> : list.isError ? <ErrorNote error={list.error} /> : all.length === 0 ? <EmptyLibrary kind="entities" /> : shown.length === 0 ? (
    <p className="m-0 px-2 py-6 text-muted-foreground">No entity matches. <button type="button" className="border-0 bg-transparent p-0 text-info hover:underline" onClick={() => { setText(""); setOnly(""); }}>Clear the filter</button></p>
  ) : rows;
  return (
    <Frame sidebar={<MainSidebar><EntityKinds /></MainSidebar>} tabs>
      {phone ? (
        <LibraryPhone kind="entities">
          <div className="px-2 pt-1">{controls}</div>
          {body}
        </LibraryPhone>
      ) : (
        <div className="flex justify-center px-7 py-8">
          <div className="flex max-w-[820px] flex-1 flex-col gap-3">
            <h1 className="m-0 flex items-center gap-2 font-serif text-[34px] font-semibold">Entities <SampleBadge capability="entities" /></h1>
            <p className="m-0 text-muted-foreground">The entities your sessions touch. Each has a page with what is currently true about it.</p>
            {controls}
            <div className="flex flex-col">{body}</div>
          </div>
        </div>
      )}
    </Frame>
  );
}

/** Points on the As-of slider: each day something changed, then now. */
function asOfSteps(e: EntityArticle | undefined): IsoTime[] {
  if (!e) return [];
  const days = new Set<string>();
  for (const t of e.timeline) days.add(localDay(new Date(t.at)));
  for (const f of e.facts) days.add(localDay(new Date(f.since)));
  const today = localDay(new Date());
  days.delete(today);
  return [...days]
    .sort()
    .map((d) => {
      const end = parseDay(d);
      end.setHours(23, 59, 59);
      return end.toISOString() as IsoTime;
    });
}

export function EntityPage() {
  const { entityId } = route.useParams();
  const { tab = "overview", asOf: asOfParam, addFact } = route.useSearch();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const asOf = asOfParam && asOfParam !== "pick" ? (asOfParam as IsoTime) : undefined;
  const now = useEntity(entityId as EntityId);
  const at = useEntity(entityId as EntityId, asOf);
  const e = asOf ? (at.data ?? now.data) : now.data;
  const steps = useMemo(() => asOfSteps(now.data), [now.data]);
  const setAsOf = (value: IsoTime | undefined) =>
    void navigate({ to: "/entities/$entityId", params: { entityId }, search: { ...(tab === "overview" ? {} : { tab }), ...(value ? { asOf: value } : {}) }, replace: true });

  const tabs: Tab<TabId>[] = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions", count: e?.sessionCount ?? 0 },
    { id: "history", label: "History", count: e?.timeline.length ?? 0 },
  ];
  const fallback = now.isPending ? <Loading /> : now.isError ? <ErrorNote error={now.error} /> : null;
  const state = e && <StatePanel e={e} steps={steps} asOf={asOf} onAsOf={setAsOf} focusSlider={asOfParam === "pick"} startAdding={addFact === 1} />;

  if (phone) {
    return (
      <Frame sidebar={null}>
        <MobileBack to="/entities" label={e ? entityTypeLabel(e) : "Entities"}>
          {e && <AsOfSheetButton steps={steps} asOf={asOf} onAsOf={setAsOf} />}
          {e && <PinButton subject={{ kind: "entity", id: e.id, title: e.title }} className="size-11" />}
        </MobileBack>
        {fallback ?? (
          <div className="flex flex-col gap-3.5 px-4 pb-6">
            <EntityTitle e={e!} phone />
            <ArticleTabs tabs={tabs} active={tab} search={(id) => ({ tab: id })} phone />
            {tab === "overview" ? (
              <>
                <PhoneFacts e={e!} readOnly={!!asOf} />
                <p className="m-0 font-serif text-[16px] leading-[1.6]">{e!.lead}</p>
                <div className="font-serif text-[16px] leading-[1.6]"><EntityArticleBody e={e!} /></div>
                <Timeline rows={e!.timeline} />
              </>
            ) : (
              <EntityTab e={e!} tab={tab} />
            )}
          </div>
        )}
      </Frame>
    );
  }

  return (
    <Frame sidebar={<MainSidebar><EntityKinds {...(e ? { selected: e } : {})} /></MainSidebar>}>
      {fallback ?? (
        <>
          <ArticleBar crumbs={<Crumbs items={[{ label: entityTypeLabel(e!), to: `/entities#${e!.type}` }, { label: e!.title }]} />}>
            <ArticleTabs tabs={tabs} active={tab} search={(id) => ({ tab: id })} />
            <span className="ml-2 rounded-lg border border-border bg-card px-2.5 py-1 text-[12px]" title="Who can see this entity">{visibilityLabel(e!.visibility)}</span>
            <PinButton subject={{ kind: "entity", id: e!.id, title: e!.title }} />
          </ArticleBar>
          <ArticleBody side={state}>
            <EntityTitle e={e!} />
            <EntityTab e={e!} tab={tab} />
          </ArticleBody>
        </>
      )}
    </Frame>
  );
}

function EntityTitle({ e, phone }: { e: EntityArticle; phone?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2.5">
        <h1 className={cx("m-0 font-serif leading-[1.15] font-semibold", phone ? "text-[30px]" : "text-[34px]")}>{e.title}</h1>
        <SampleBadge capability="entities" />
      </span>
      <span className="font-sans text-[13px] text-muted-foreground">
        {entityTypeLabel(e)}
        {e.aliases.length > 0 && ` · also ${e.aliases.map((a) => `“${a}”`).join(", ")}`}
        {e.lastVerified && ` · last checked ${shortDate(e.lastVerified)}`}
        {e.topic && (
          <>
            {" · in "}
            <Link to="/topics/$topicId" params={{ topicId: e.topic.id }}>{e.topic.path.join(" › ")}</Link>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * The article the entity worker wrote. It ends with a "Current facts" list; when the facts themselves are
 * on the page, that list is dropped so the two cannot disagree.
 */
function EntityArticleBody({ e }: { e: EntityArticle }) {
  if (!e.article) return null;
  const body = articleBody(e.article, e.title, { dropFacts: e.facts.length > 0, dropLead: e.lead });
  return body ? <Markdown source={body} /> : null;
}

interface TimelineRow {
  at: string;
  text: string;
  kind: ChangeKind;
  source?: { id: string; title: string } | undefined;
}

function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (!rows.length) return null;
  return (
    <>
      <H2>Timeline</H2>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0 font-sans text-[14px]">
        {[...rows].sort((a, b) => b.at.localeCompare(a.at)).map((t, i) => (
          <li key={i} className="grid grid-cols-[60px_10px_minmax(0,1fr)] items-baseline gap-2.5" style={{ opacity: i === rows.length - 1 && rows.length > 3 ? 0.75 : 1 }}>
            <span className="text-[12px] text-muted-foreground">{shortDate(t.at)}</span>
            <span aria-hidden="true" className="size-2 self-center rounded-full" style={{ background: changeKind[t.kind]!.color }} />
            <span className="leading-[1.5]">
              {/* A fact line starts with its key, as the worker wrote it; show it the way facts are shown elsewhere. */}
              {t.kind === "fact" ? reviewText({ group: "fact", text: t.text }) : t.kind === "conflict" ? reviewText({ group: "conflict", text: t.text }) : t.text}{" "}
              {t.source && <Link to="/sessions/$sessionId" params={{ sessionId: t.source.id }} className="text-[12px]">{t.source.title}</Link>}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

function EntityHistory({ e }: { e: EntityArticle }) {
  const changes = useChanges(e.id).data;
  const combined = [...e.timeline, ...(changes ?? [])];
  const unique = combined.filter((row, i) => combined.findIndex((r) => r.at === row.at && r.text === row.text && r.source?.id === row.source?.id) === i);
  return <Timeline rows={unique} />;
}

function EntityTab({ e, tab }: { e: EntityArticle; tab: TabId }) {
  if (tab === "sessions") return <SessionRows sessions={e.sessions} />;
  if (tab === "history") {
    const previous = e.facts.filter((f) => f.previous);
    return (
      <>
        <EntityHistory e={e} />
        {previous.length > 0 && (
          <>
            <H2>Earlier values</H2>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 font-sans text-[14px]">
              {previous.map((f) => (
                <li key={f.id}>
                  <b className="font-medium">{factLabel(f.key)}</b> was {f.previous!.value} until {shortDate(f.previous!.until)}
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }
  return (
    <>
      <p className="m-0">{e.lead}</p>
      <EntityArticleBody e={e} />
      <Timeline rows={e.timeline} />
      {e.connected.length > 0 && (
        <>
          <H2>Connected</H2>
          <p className="m-0 font-sans text-[14px]">
            {e.connected.map((c, i) => (
              <span key={c.id}>
                {i > 0 && " · "}
                <Link to="/entities/$entityId" params={{ entityId: c.id }}>{c.title}</Link> ({c.sharedSessions}
                {i === 0 ? " shared sessions" : ""})
              </span>
            ))}
          </p>
        </>
      )}
      {e.tags.length > 0 && <div className="font-sans"><Tags tags={e.tags} /></div>}
      <H2 right={e.sessions.length > 4 ? <Link to="." search={{ tab: "sessions" } as never}>All {e.sessionCount}</Link> : undefined}>Sessions</H2>
      <SessionRows sessions={e.sessions.slice(0, 4)} />
    </>
  );
}

function useConflictLink(e: EntityArticle) {
  const queue = useReviewQueue().data;
  return (f: Fact) => queue?.find((i) => i.group === "conflict" && i.subject.id === e.id && i.text === f.key)?.id;
}

function factMeta(f: Fact) {
  if (f.pinned) return "pinned by you";
  const since = dayLabel(f.since) === "Today" ? `since today ${time(f.since)}` : `since ${shortDate(f.since)}`;
  return f.previous ? `${since} · was ${f.previous.value}` : since;
}

interface Draft {
  id?: Fact["id"];
  key: string;
  value: string;
  pinned: boolean;
}

function StatePanel({ e, steps, asOf, onAsOf, focusSlider, startAdding }: { e: EntityArticle; steps: IsoTime[]; asOf: IsoTime | undefined; onAsOf: (v: IsoTime | undefined) => void; focusSlider: boolean; startAdding: boolean }) {
  const setFact = useSetFact();
  const conflictFor = useConflictLink(e);
  const [draft, setDraft] = useState<Draft | null>(startAdding ? { key: "", value: "", pinned: false } : null);
  const slider = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusSlider) slider.current?.focus();
  }, [focusSlider]);
  const index = asOf ? Math.max(0, steps.findIndex((s) => s >= asOf)) : steps.length;
  const sources = new Set(e.facts.flatMap((f) => f.sources.map((s) => s.session.id))).size;

  function save(d: Draft) {
    if (!d.key.trim() || !d.value.trim()) return;
    const fact: Draft = { key: d.key.trim(), value: d.value.trim(), pinned: d.pinned };
    if (d.id) fact.id = d.id;
    setFact.mutate({ entity: e.id, fact });
    setDraft(null);
  }

  return (
    <aside aria-label="State" className="flex min-w-0 flex-[1_1_290px] flex-col self-start overflow-hidden rounded-xl border border-border bg-card font-sans text-[13px] md:max-w-[330px]">
      <div className="flex flex-col gap-2 bg-raised px-3.5 py-3">
        <span className="flex items-center justify-between">
          <h2 className="m-0 text-[13px] font-semibold">State</h2>
          <span className="text-[12px] text-muted-foreground">from {plural(Math.max(sources, e.sessionCount), "session")}</span>
        </span>
        <div role="group" aria-label="As of" className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">As of</span>
          <input
            ref={slider}
            type="range"
            min={0}
            max={steps.length}
            value={index}
            aria-label="As of date"
            aria-valuetext={index === steps.length ? "Now" : shortDate(steps[index]!)}
            onChange={(ev) => {
              const i = Number(ev.target.value);
              onAsOf(i >= steps.length ? undefined : steps[i]);
            }}
            className="flex-1 accent-primary"
          />
          <span className="w-12 text-right text-[12px] font-semibold">{index === steps.length ? "Now" : shortDate(steps[index]!)}</span>
        </div>
      </div>
      {e.facts.map((f) =>
        draft?.id === f.id ? (
          <FactEditor key={f.id} draft={draft} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} />
        ) : (
          <div
            key={f.id}
            className="grid grid-cols-[88px_minmax(0,1fr)_18px] items-start gap-2 border-t border-border px-3.5 py-2"
            style={f.conflict ? { background: "color-mix(in srgb, var(--warning) 7%, transparent)" } : undefined}
          >
            <span className="text-muted-foreground">{factLabel(f.key)}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              {asOf ? (
                <span>{f.value}</span>
              ) : (
                <button
                  type="button"
                  aria-label={`Edit ${f.key}`}
                  onClick={() => setDraft({ id: f.id, key: f.key, value: f.value, pinned: f.pinned })}
                  className="-mx-1 rounded px-1 text-left hover:bg-accent"
                  style={{ color: f.conflict ? "var(--warning)" : /^online$/i.test(f.value) ? "var(--success)" : "var(--foreground)" }}
                >
                  {f.value}
                </button>
              )}
              <span className="text-[11px] text-muted-foreground">{factMeta(f)}</span>
              {f.conflict && (
                <Link to="/review" search={conflictFor(f) ? { item: conflictFor(f)! } : {}} className="text-[12px]">
                  Resolve · {f.conflict.candidates.length} sessions disagree
                </Link>
              )}
            </span>
            <span className="pt-0.5 text-muted-foreground">{f.pinned && <PinIcon size={13} aria-label="Pinned" role="img" aria-hidden={false} />}</span>
          </div>
        ),
      )}
      {draft && !draft.id && <FactEditor draft={draft} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} isNew />}
      {!asOf && !draft && (
        <button type="button" onClick={() => setDraft({ key: "", value: "", pinned: false })} className="border-t border-border px-3.5 py-2 text-left text-[13px] text-muted-foreground hover:text-foreground">
          + Add a fact
        </button>
      )}
      {asOf && <span className="border-t border-border px-3.5 py-2 text-[12px] text-muted-foreground">Showing what memory knew on {shortDate(asOf)}. Slide to Now to edit.</span>}
    </aside>
  );
}

function FactEditor({ draft, onChange, onSave, onCancel, isNew }: { draft: Draft; onChange: (d: Draft) => void; onSave: (d: Draft) => void; onCancel: () => void; isNew?: boolean }) {
  return (
    <form
      aria-label={isNew ? "New fact" : `Editing ${draft.key}`}
      className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 border-t border-border px-3.5 py-2"
      style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
      onSubmit={(ev) => {
        ev.preventDefault();
        onSave(draft);
      }}
      onKeyDown={(ev) => ev.key === "Escape" && onCancel()}
    >
      <input
        autoFocus={isNew}
        aria-label="Field"
        value={draft.key}
        onChange={(ev) => onChange({ ...draft, key: ev.target.value })}
        className="min-w-0 rounded-md border border-input bg-background px-1.5 py-1 text-[13px] text-foreground outline-none focus:border-primary"
      />
      <span className="flex flex-col gap-1.5">
        <input
          autoFocus={!isNew}
          aria-label="Value"
          value={draft.value}
          onChange={(ev) => onChange({ ...draft, value: ev.target.value })}
          className="min-w-0 rounded-md border border-input bg-background px-1.5 py-1 text-[13px] text-foreground outline-none focus:border-primary"
        />
        <span className="flex items-center gap-1.5">
          <label className="flex flex-1 items-center gap-1 text-[12px]">
            <input type="checkbox" checked={draft.pinned} onChange={(ev) => onChange({ ...draft, pinned: ev.target.checked })} className="accent-primary" /> Pin
          </label>
          <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="xs" variant="primary" type="submit">Save</Button>
        </span>
      </span>
    </form>
  );
}

function AsOfSheetButton({ steps, asOf, onAsOf }: { steps: IsoTime[]; asOf: IsoTime | undefined; onAsOf: (v: IsoTime | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="As of a date" onClick={() => setOpen(true)} className="min-h-9 rounded-full border border-border bg-card px-3 text-[13px] text-foreground">
        As of: {asOf ? shortDate(asOf) : "now"} ▾
      </button>
      {open && (
        <Modal label="Show as of a date" placement="sheet" onClose={() => setOpen(false)} className="gap-1 px-3">
          <span className="px-2 py-1 text-[12px] font-semibold text-muted-foreground">SHOW AS OF</span>
          {[...steps.map((s) => ({ label: shortDate(s), value: s as IsoTime | undefined })), { label: "Now", value: undefined }].reverse().map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                onAsOf(o.value);
                setOpen(false);
              }}
              className={cx("flex min-h-12 items-center rounded-xl px-3 text-left text-foreground", o.value === asOf && "bg-selected")}
            >
              {o.label}
            </button>
          ))}
        </Modal>
      )}
    </>
  );
}

function PhoneFacts({ e, readOnly }: { e: EntityArticle; readOnly: boolean }) {
  const setFact = useSetFact();
  const conflictFor = useConflictLink(e);
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Draft | null>(null);
  return (
    <section aria-label="State" className="overflow-hidden rounded-[14px] border border-border bg-card text-[14px]">
      {e.facts.map((f) => (
        <button
          key={f.id}
          type="button"
          disabled={readOnly}
          aria-label={`${f.conflict ? "Resolve" : "Edit"} ${f.key}`}
          onClick={() => {
            const item = f.conflict && conflictFor(f);
            if (item) void navigate({ to: "/review", search: { item } });
            else setEditing({ id: f.id, key: f.key, value: f.value, pinned: f.pinned });
          }}
          className="grid min-h-12 w-full grid-cols-[96px_minmax(0,1fr)_14px] items-center gap-2 border-0 border-b border-border px-3.5 py-2 text-left text-foreground last:border-b-0 disabled:opacity-100"
          style={f.conflict ? { background: "color-mix(in srgb, var(--warning) 8%, transparent)" } : undefined}
        >
          <span className="text-[13px] text-muted-foreground">{factLabel(f.key)}</span>
          <span className="flex flex-col">
            <span style={{ color: f.conflict ? "var(--warning)" : /^online$/i.test(f.value) ? "var(--success)" : undefined }}>
              {f.value}
              {f.conflict ? " · disputed" : ""}
            </span>
            <span className="text-[11px] text-muted-foreground">{f.conflict ? "Tap to resolve" : factMeta(f)}</span>
          </span>
          <span aria-hidden="true" className="text-muted-foreground">›</span>
        </button>
      ))}
      {editing && (
        <Modal label={`Edit ${editing.key}`} placement="sheet" onClose={() => setEditing(null)} className="gap-3.5 px-4">
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(ev) => {
              ev.preventDefault();
              const fact: Draft = { key: editing.key, value: editing.value.trim(), pinned: editing.pinned };
              if (editing.id) fact.id = editing.id;
              if (fact.value) setFact.mutate({ entity: e.id, fact });
              setEditing(null);
            }}
          >
            <span className="flex items-baseline gap-2">
              <span className="flex-1 text-[17px] font-semibold">{editing.key}</span>
              {(() => {
                const src = e.facts.find((f) => f.id === editing.id)?.sources[0];
                return src && <span className="text-[12px] text-muted-foreground">from {src.session.title} · {shortDate(src.at)}</span>;
              })()}
            </span>
            <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
              Value
              <input
                value={editing.value}
                onChange={(ev) => setEditing({ ...editing, value: ev.target.value })}
                className="min-h-12 rounded-xl border border-input bg-background px-3.5 text-[16px] text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-xl bg-card px-3.5">
              <span className="flex flex-1 flex-col">
                <span>Pin this</span>
                <span className="text-[12px] text-muted-foreground">The wiki writer leaves pinned facts alone</span>
              </span>
              <input type="checkbox" checked={editing.pinned} onChange={(ev) => setEditing({ ...editing, pinned: ev.target.checked })} className="size-[22px] accent-primary" />
            </label>
            <div className="grid grid-cols-[1fr_1.6fr] gap-2">
              <Button size="lg" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="lg" variant="primary" type="submit" className="font-semibold">Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
