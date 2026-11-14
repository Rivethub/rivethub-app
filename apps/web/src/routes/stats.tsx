import { count, whenLabel } from "@rivethub/client-runtime/format";
import type { MemoryStats, WorkerId } from "@rivethub/contracts";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useDismissFlagged, useFlagged, useMemoryStats, useRetryFlagged } from "../client/queries";
import { MobileBack } from "../components/article";
import { Frame, MainSidebar } from "../components/shell";
import { Button, cx, ErrorNote, Loading } from "../components/ui";
import { useIsPhone } from "../lib/media";

const workerName: Record<WorkerId, { name: string; does: string }> = {
  embedder: { name: "Embedder", does: "Makes messages findable by meaning." },
  summarizer: { name: "Summarizer", does: "Writes each session's summary." },
  categorizer: { name: "Categorizer", does: "Files sessions and suggests tags." },
  "wiki-builder": { name: "Wiki builder", does: "Writes topic and entity pages." },
};

/** rh's job names, as what the job does. An unknown job keeps its name. */
const JOBS: Record<string, string> = {
  "compact-conversation": "Summarize a session",
  "extract-wiki": "Write wiki pages from a session",
  "extract-entities": "Update entity pages from a session",
  "entity-backfill": "Catch up entity pages",
  "stale-entity-sweep": "Queue sessions for entity pages",
  "enqueue-stale-wiki": "Queue sessions for the wiki",
  "propose-tidy": "Suggest tidy-ups",
  "embed-messages": "Make messages findable by meaning",
  "embed-summaries": "Make summaries findable by meaning",
  "categorize-conversation": "File a session under a topic",
  "title-conversation": "Title a session",
};
export const jobName = (task: string) => JOBS[task] ?? task;

function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: "warn" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-card px-3.5 py-3">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cx("text-[20px] leading-tight font-medium", tone === "warn" && "text-warning")}>{value}</span>
      {note && <span className="text-[12px] leading-[1.4] text-muted-foreground">{note}</span>}
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = `stats-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <h2 id={id} className="m-0 flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold">
        {title}
        {hint && <span className="text-[13px] font-normal text-muted-foreground">{hint}</span>}
      </h2>
      {children}
    </section>
  );
}

const grid = "grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5";

function Body({ s }: { s: MemoryStats }) {
  const total = s.searchable.embedded + s.searchable.waiting + s.searchable.failed;
  const filed = s.filing.byCategorizer + s.filing.byYou;
  return (
    <>
      <Group title="In memory">
        <div className={grid}>
          <Tile label="Sessions" value={count(s.sessions)} />
          <Tile label="Messages" value={count(s.messages)} note={`${count(s.toolCalls)} tool calls`} />
          <Tile label="Summaries" value={count(s.summaries)} />
          <Tile
            label="Findable by meaning"
            value={total ? `${count(s.searchable.embedded)} of ${count(total)}` : "None yet"}
            note={s.searchable.failed ? `${count(s.searchable.failed)} failed · ${count(s.searchable.waiting)} waiting` : s.searchable.waiting ? `${count(s.searchable.waiting)} waiting` : total ? "All caught up" : "Needs an embedding model. Word search works without one."}
            {...(s.searchable.failed ? { tone: "warn" as const } : {})}
          />
        </div>
      </Group>
      <Group title="Filing" hint="Where sessions were put, and by whom.">
        <div className={grid}>
          <Tile label="Filed" value={count(filed)} note={`${count(s.filing.byCategorizer)} by the categorizer · ${count(s.filing.byYou)} by you`} />
          <Tile label="Not filed yet" value={count(s.filing.notFiled)} note={s.filing.notFiled ? <Link to="/sessions" search={{ view: "unfiled" }}>See them</Link> : `${count(s.filing.leftOut)} left out, such as test runs`} />
          <Tile label="Corrections" value={count(s.filing.correctionsLastWeek)} note="by you, in the last week" />
        </div>
      </Group>
      <Group title="Wiki">
        <div className={grid}>
          <Tile label="Topic pages" value={count(s.wiki.topicPages)} />
          <Tile label="Entities" value={count(s.wiki.entities)} note={s.wiki.entityTypes.slice(0, 4).map((t) => `${t.count} ${t.name}`).join(" · ")} />
          <Tile label="Pages without a topic" value={count(s.wiki.loosePages)} />
        </div>
      </Group>
      <Group title="Workers" hint="The background jobs that keep memory organized.">
        <div className={grid}>
          {s.workers.map((w) => (
            <Tile
              key={w.id}
              label={workerName[w.id].name}
              value={w.lastFinishedAt ? whenLabel(w.lastFinishedAt) : "Not run yet"}
              note={w.failing ? `${w.failing} failing` : workerName[w.id].does}
              {...(w.failing ? { tone: "warn" as const } : {})}
            />
          ))}
        </div>
      </Group>
    </>
  );
}

function Flagged() {
  const flagged = useFlagged();
  const retry = useRetryFlagged();
  const dismiss = useDismissFlagged();
  const groups = flagged.data;
  if (!groups || groups.length === 0) return null;
  return (
    <Group title="Failed jobs" hint="Grouped by cause. Retry after fixing the cause, or dismiss to stop seeing it.">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {groups.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/40 bg-card px-3.5 py-3">
            <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
              <span className="font-medium">{g.count} × {jobName(g.task)}</span>
              <span className="text-[13px] leading-[1.45] text-muted-foreground">{g.cause.trim() || "No cause was recorded"} · last {whenLabel(g.lastFailedAt)}</span>
            </span>
            <Button variant="primary" size="md" disabled={retry.isPending} onClick={() => retry.mutate(g.id)}>Retry</Button>
            <Button size="md" disabled={dismiss.isPending} onClick={() => dismiss.mutate(g.id)}>Dismiss</Button>
          </li>
        ))}
      </ul>
    </Group>
  );
}

/** What is in memory and whether it is being kept up: counts, filing, the wiki, the workers, and jobs that failed. */
export function StatsPage() {
  const phone = useIsPhone();
  const stats = useMemoryStats();
  return (
    <Frame sidebar={<MainSidebar />}>
      {phone && <MobileBack to="/" label="Today" />}
      <div className="flex justify-center px-4 pb-8 md:px-7 md:py-8">
        <div className="flex min-w-0 max-w-[820px] flex-1 flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 font-serif text-[28px] font-semibold md:text-[32px]">Stats</h1>
            <p className="m-0 max-w-[62ch] leading-[1.55] text-muted-foreground">What is in memory, and whether the work of organizing it is keeping up.</p>
          </div>
          {stats.data === null ? (
            <p className="m-0 text-muted-foreground">This hub does not report its stats to the app.</p>
          ) : stats.isPending ? <Loading /> : stats.isError ? <ErrorNote error={stats.error} /> : (
            <>
              {stats.data.toTidy > 0 && (
                <p className="m-0 flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5">
                  <span className="min-w-0 flex-1">{stats.data.toTidy} {stats.data.toTidy === 1 ? "change is" : "changes are"} waiting for you in Review.</span>
                  <Link to="/review" className="font-medium">Open Review</Link>
                </p>
              )}
              <Flagged />
              <Body s={stats.data} />
            </>
          )}
        </div>
      </div>
    </Frame>
  );
}
