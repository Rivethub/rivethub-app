import { shortDate, time } from "@rivethub/client-runtime/format";
import type { SearchMode, SearchOptions, SearchPassage, SearchScope, SearchWindow } from "@rivethub/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { useSearch } from "../client/queries";
import { SearchIcon } from "../components/icons";
import { PaletteList, usePaletteGroups } from "../components/palette";
import { Frame, MainSidebar } from "../components/shell";
import { cx, SampleBadge } from "../components/ui";
import { markStep } from "../lib/journey";
import { useIsPhone } from "../lib/media";

const route = getRouteApi("/search");

const WINDOWS: { id: SearchWindow | ""; label: string }[] = [
  { id: "", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7d", label: "Last 7 days" },
  { id: "last_14d", label: "Last 14 days" },
];
const SCOPES: { id: SearchScope | ""; label: string }[] = [
  { id: "", label: "Messages and summaries" },
  { id: "messages", label: "Messages only" },
  { id: "summaries", label: "Summaries only" },
];
const MODES: { id: SearchMode; label: string; hint: string }[] = [
  { id: "best", label: "Best match", hint: "Blends every method below." },
  { id: "words", label: "Exact words", hint: "The words as typed." },
  { id: "fuzzy", label: "Similar spelling", hint: "Forgives typos and partial names." },
  { id: "meaning", label: "Meaning", hint: "Finds the idea in other words. Needs an embedding model." },
  { id: "pattern", label: "Pattern", hint: "A regular expression." },
];

const roleLabel: Record<NonNullable<SearchPassage["role"]>, string> = { user: "You", assistant: "Agent", tool: "Tool", system: "System" };

/** Bolds each query word where it appears. Skipped for a pattern search, where the query is not words. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-transparent font-medium text-warning">{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="min-h-9 appearance-none rounded-lg border border-input bg-card bg-[url(/icons/select-chevron.svg)] bg-[length:10px] bg-[right_10px_center] bg-no-repeat py-1.5 pr-7 pl-2.5 text-[13px] text-foreground">
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

/**
 * Search as a page. Type and the best matches appear; the filters are one
 * click away for narrowing by time, by messages or summaries, and by how to
 * match. The Ctrl K box stays the fast path for jumping.
 */
export function SearchPage() {
  const params = route.useSearch();
  const q = params.q ?? "";
  const navigate = useNavigate();
  const phone = useIsPhone();
  const [text, setText] = useState(q);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(!!(params.where || params.match));
  useEffect(() => setText(q), [q]);
  useEffect(() => setActive(0), [text]);

  const options: SearchOptions = { ...(params.when ? { window: params.when } : {}), ...(params.where ? { scope: params.where } : {}), ...(params.match ? { mode: params.match } : {}) };
  const filterCount = Object.keys(options).length;
  const advanced = (params.where ? 1 : 0) + (params.match ? 1 : 0);
  const query = text.trim();
  const results = useSearch(query, options);
  const groups = usePaletteGroups(text).filter((g) => g.title !== "Ask");
  const flat = groups.flatMap((g) => g.items);
  const passages = results.data?.passages ?? [];
  useEffect(() => {
    if (query && results.data) markStep("search");
  }, [query, results.data]);

  type Params = typeof params;
  /** Sets or clears search params; an undefined value removes the key. */
  const go = (patch: { [K in keyof Params]?: Params[K] | undefined }) => {
    const next = { ...params, ...patch };
    void navigate({ to: "/search", search: Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Params, replace: true });
  };

  return (
    <Frame sidebar={<MainSidebar />} tabs>
      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3 px-4 pt-4 pb-8 text-[15px] md:pt-8">
        <h1 className="sr-only">Search</h1>
        <label className="flex min-h-12 items-center gap-2.5 rounded-[14px] border-2 border-primary bg-card px-3.5">
          <SearchIcon className="text-muted-foreground" />
          <span className="sr-only">Search memory</span>
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="search-list"
            aria-activedescendant={flat.length ? `search-${active}` : undefined}
            value={text}
            placeholder="Search every session, topic and entity"
            onChange={(e) => {
              setText(e.target.value);
              go({ q: e.target.value || undefined });
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, flat.length - 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
              else if (e.key === "Enter") flat[active]?.run();
              else return;
              e.preventDefault();
            }}
            className="min-w-0 flex-1 border-0 bg-transparent text-[17px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          {text && (
            <button type="button" aria-label="Clear" onClick={() => { setText(""); go({ q: undefined }); }} className="size-8 border-0 bg-transparent text-muted-foreground">✕</button>
          )}
        </label>

        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <div role="group" aria-label="When" className="flex flex-wrap gap-1.5">
            {WINDOWS.map((w) => {
              const on = (params.when ?? "") === w.id;
              return (
                <button key={w.id} type="button" aria-pressed={on} onClick={() => go({ when: w.id || undefined })} className={cx("rounded-full border px-3 py-1", phone && "min-h-9", on ? "border-transparent bg-selected text-foreground" : "border-border bg-transparent text-muted-foreground hover:text-foreground")}>
                  {w.label}
                </button>
              );
            })}
          </div>
          <span className="flex-1" />
          <button type="button" aria-expanded={open} aria-controls="search-filters" onClick={() => setOpen((o) => !o)} className={cx("rounded-full border px-3 py-1 text-foreground", phone && "min-h-9", advanced ? "border-primary" : "border-border", open ? "bg-selected" : "bg-transparent")}>
            More filters{advanced ? ` · ${advanced}` : ""}
          </button>
          {filterCount > 0 && <button type="button" onClick={() => go({ when: undefined, where: undefined, match: undefined })} className="border-0 bg-transparent px-1 text-info hover:underline">Clear</button>}
          <SampleBadge capability="search" />
        </div>
        {open && (
          <div id="search-filters" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 rounded-xl border border-border bg-card p-3.5">
            <Select label="Look in" value={params.where ?? ""} options={SCOPES} onChange={(v) => go({ where: v || undefined })} />
            <Select label="Match by" value={params.match ?? "best"} options={MODES} onChange={(v) => go({ match: v === "best" ? undefined : v })} />
            <p className="col-span-full m-0 text-[12px] text-muted-foreground">{MODES.find((m) => m.id === (params.match ?? "best"))!.hint}</p>
          </div>
        )}

        {!query ? (
          <div className="-mx-2"><PaletteList groups={groups} active={active} onHover={setActive} idPrefix="search" large={phone} /></div>
        ) : (
          <>
            {results.data?.degraded && <p role="status" className="m-0 rounded-lg border border-border px-3 py-2 text-[13px] text-muted-foreground">{results.data.degraded}</p>}
            {flat.length > 0 && <div className="-mx-2"><PaletteList groups={groups} active={active} onHover={setActive} idPrefix="search" large={phone} /></div>}
            <section aria-labelledby="in-sessions" className="flex flex-col">
              <h2 id="in-sessions" className="m-0 flex items-baseline gap-2 border-b border-border pb-2 text-[13px] font-semibold">
                In sessions
                {results.data && <span className="font-normal text-muted-foreground">{passages.length} {passages.length === 1 ? "match" : "matches"}</span>}
              </h2>
              {results.isPending ? (
                <p role="status" className="m-0 py-4 text-muted-foreground">Searching…</p>
              ) : results.isError ? (
                <p role="alert" className="m-0 py-4 text-[14px] leading-[1.5] text-error">
                  The search did not finish{results.error instanceof Error ? `: ${results.error.message}` : ""}.{" "}
                  <button type="button" className="border-0 bg-transparent p-0 text-info hover:underline" onClick={() => void results.refetch()}>Try again</button>
                </p>
              ) : passages.length === 0 ? (
                <p className="m-0 py-4 text-[14px] leading-[1.5] text-muted-foreground">
                  Nothing in any session matches{filterCount ? " with these filters" : ""}. {params.match ? "" : <>Try <button type="button" className="border-0 bg-transparent p-0 text-info hover:underline" onClick={() => { setOpen(true); go({ match: "fuzzy" }); }}>similar spelling</button>.</>}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0 pt-3">
                  {passages.map((p) => (
                    <li key={p.id}>
                      <Link to="/sessions/$sessionId" params={{ sessionId: p.session.id }} search={p.source === "summary" ? { tab: "summary" } : { tab: "transcript" }} className="group flex flex-col gap-1.5 rounded-xl bg-card px-3.5 py-3 text-foreground hover:bg-raised hover:no-underline">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                          <span className="rounded-md bg-raised px-1.5 py-px group-hover:bg-card">{p.owner && `${p.owner}’s session · `}{p.source === "summary" ? "Summary" : p.role ? roleLabel[p.role] : "Message"}</span>
                          <span className="min-w-0 truncate font-medium text-foreground">{p.session.title}</span>
                          {p.at && <span>{shortDate(p.at)}, {time(p.at)}</span>}
                          <span className="flex-1" />
                          <span className="rounded-full border border-primary px-2.5 py-px text-primary">Open session</span>
                        </span>
                        <span className="text-[14px] leading-[1.55] text-muted-foreground"><Highlight text={p.text} query={params.match === "pattern" ? "" : query} /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Frame>
  );
}
