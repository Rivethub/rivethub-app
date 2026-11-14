import { SubjectType } from "../components/subject-type";
import { count, reviewText, harnessNames, hasNoMessages, localDay, longDay, parseDay, primaryAction, shortDate, subjectKindLabel, whenLabel } from "@rivethub/client-runtime/format";
import type { ReviewItem, TodayDigest } from "@rivethub/contracts";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useDecide, useHarnesses, useModelJobs, useReviewQueue, useToday } from "../client/queries";
import { NextStep } from "../components/journey";
import { Frame, MainSidebar, MobileHeader } from "../components/shell";
import { Button, Dot, ErrorNote, KindTag, Loading, RichText, SampleBadge } from "../components/ui";
import { changeKind, listSentence, reviewKindLabel, subjectHref } from "../lib/format";
import { useIsPhone } from "../lib/media";

const route = getRouteApi("/");

export function TodayPage() {
  const { date } = route.useSearch();
  const today = useToday(date);
  const phone = useIsPhone();
  const digest = today.data;
  return (
    <Frame sidebar={<MainSidebar />} aside={digest && <TodayAside digest={digest} />} tabs>
      {phone && (
        <MobileHeader>
          <span className="flex-1 text-[13px] text-muted-foreground">{digest ? longDay(digest.date) : ""}</span>
        </MobileHeader>
      )}
      {today.isPending ? <Loading /> : today.isError ? <ErrorNote error={today.error} /> : phone ? <TodayPhone digest={today.data} /> : <TodayDesktop digest={today.data} />}
    </Frame>
  );
}

function Lede({ digest, phone }: { digest: TodayDigest; phone?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {!phone && (
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          {longDay(digest.date)}
          <SampleBadge capability="today" />
        </span>
      )}
      <h1 className={phone ? "m-0 font-serif text-[27px] leading-[1.2] font-semibold" : "m-0 font-serif text-[34px] leading-[1.2] font-semibold"}>{digest.headline}</h1>
      <p className={phone ? "m-0 font-serif text-[16px] leading-[1.55]" : "m-0 font-serif text-[17px] leading-[1.6]"}>
        <RichText text={digest.summary} />
      </p>
      {phone && <SampleBadge capability="today" />}
    </div>
  );
}

/**
 * One line, only when memory is not being fed or worked on properly: a tool
 * stopped sending sessions, nothing is connected, or a model job is failing.
 * Silent when all is well.
 */
function Health({ phone }: { phone?: boolean }) {
  const harnesses = useHarnesses().data;
  const jobs = useModelJobs().data;
  if (!harnesses) return null;
  const stale = harnesses.filter((h) => h.capture.state === "stale");
  // A tool that is set up and has sent nothing yet is not sending, and has not stopped either.
  const none = !harnesses.some((h) => h.capture.state === "receiving" || h.capture.state === "stale");
  const failing = (jobs ?? []).filter((j) => j.health === "failing");
  // A job that is in trouble while work piles up behind it is not keeping up, whatever the hub calls it.
  const behind = (jobs ?? []).filter((j) => j.health === "slow" && j.queued > 0);
  const problems = [
    none ? "No tool is sending sessions yet" : "",
    stale.length ? `${stale.map((h) => h.name).join(" and ")} stopped sending sessions` : "",
    failing.length ? `the ${failing.map((j) => j.role).join(" and ")} ${failing.length === 1 ? "model is" : "models are"} failing` : "",
    behind.length ? `the ${behind.map((j) => j.role).join(" and ")} ${behind.length === 1 ? "is" : "are"} behind, with ${count(behind.reduce((total, j) => total + j.queued, 0))} waiting` : "",
  ].filter(Boolean);
  if (!problems.length) return null;
  const text = listSentence(problems);
  return (
    <p role="status" className={phone ? "m-0 flex items-center gap-2.5 rounded-xl border border-warning/50 bg-card p-3 text-[14px]" : "m-0 flex items-center gap-2.5 rounded-xl border border-warning/50 bg-card px-3.5 py-2.5"}>
      <Dot color="var(--warning)" />
      <span className="min-w-0 flex-1">{text[0]!.toUpperCase() + text.slice(1)}.</span>
      <Link to="/settings/$section" params={{ section: "connections" }} className="shrink-0 font-medium">Fix</Link>
    </p>
  );
}

function NeedsCard({ item }: { item: ReviewItem }) {
  const decide = useDecide();
  const kind = reviewKindLabel[item.group];
  const primary = item.group === "conflict" && item.options?.[0] ? { kind: "choose" as const, value: item.options[0].value } : { kind: "accept" as const };
  const label = item.group === "conflict" ? `${reviewText(item)}: ${item.options?.map((o) => (o.source ? `${o.label} (${shortDate(o.source.at)})` : o.label)).join(" or ")}?` : reviewText(item);
  return (
    <article
      className="flex flex-col gap-2 rounded-[10px] border bg-card p-3"
      style={{ borderColor: item.group === "conflict" ? "color-mix(in srgb, var(--warning) 45%, transparent)" : "var(--border)" }}
    >
      <span className="flex items-center gap-1.5">
        <KindTag {...kind} />
        <Link to={subjectHref(item.subject)} className="text-[13px] font-medium">{item.subject.title}</Link>{item.subject.kind === "entity" && <SubjectType subject={item.subject} />}
      </span>
      <span className="flex-1 leading-[1.45]">{label}</span>
      <span className="flex gap-1.5">
        <Button variant="primary" size="xs" className="px-2.5 py-[3px]" disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, decision: primary })}>
          {primaryAction(item)}
        </Button>
        <Button size="xs" className="px-2.5 py-[3px]" disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, decision: { kind: "later" } })}>
          Later
        </Button>
      </span>
    </article>
  );
}

/** Several filing proposals read better as one card that files them all. */
function FilingCard({ items }: { items: ReviewItem[] }) {
  const decide = useDecide();
  const kind = reviewKindLabel.filing;
  return (
    <article className="flex flex-col gap-2 rounded-[10px] border border-border bg-card p-3">
      <span className="flex items-center gap-1.5">
        <KindTag {...kind} />
        <Link to="/review" className="text-[13px] font-medium">{items.length} sessions</Link>
      </span>
      <span className="flex-1 leading-[1.45]">Unfiled sessions with suggested topics.</span>
      <span className="flex gap-1.5">
        <Button variant="primary" size="xs" className="px-2.5 py-[3px]" disabled={decide.isPending} onClick={() => items.forEach((i) => decide.mutate({ id: i.id, decision: { kind: "accept" } }))}>
          File all
        </Button>
        <Button size="xs" className="px-2.5 py-[3px]" disabled={decide.isPending} onClick={() => items.forEach((i) => decide.mutate({ id: i.id, decision: { kind: "later" } }))}>
          Later
        </Button>
      </span>
    </article>
  );
}

function NeedsCards({ digest }: { digest: TodayDigest }) {
  const filing = (useReviewQueue().data ?? []).filter((i) => i.group === "filing");
  return (
    <>
      {digest.needsYou.map((item, i) => {
        if (item.group !== "filing" || filing.length <= 1) return <NeedsCard key={item.id} item={item} />;
        // Several filing proposals are one decision. Show the card where the first of them falls.
        return digest.needsYou.findIndex((other) => other.group === "filing") === i ? <FilingCard key="filing" items={filing} /> : null;
      })}
    </>
  );
}

/** A session that captured nothing and changed nothing is not news. Tools open such sessions all the time. */
const worthShowing = (digest: TodayDigest) => digest.entries.filter(({ session, changes }) => changes.length > 0 || !hasNoMessages(session));

function TodayDesktop({ digest }: { digest: TodayDigest }) {
  const entries = worthShowing(digest);
  return (
    <div className="flex justify-center px-7 py-8">
      <div className="flex min-w-0 max-w-[820px] flex-1 flex-col gap-[26px]">
        <Lede digest={digest} />
        <Health />
        {digest.needsYou.length > 0 && (
          <section aria-labelledby="needs-you" className="flex flex-col gap-2.5">
            <div className="flex items-baseline gap-2.5">
              <h2 id="needs-you" className="m-0 flex-1 text-[15px] font-semibold">
                Needs you <span className="font-normal text-muted-foreground">· {digest.needsYou.length} of {digest.reviewCount}</span>
              </h2>
              <Link to="/review" className="text-[13px]">Review all</Link>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
              <NeedsCards digest={digest} />
            </div>
          </section>
        )}
        <NextStep />
        <section aria-labelledby="changed" className="flex flex-col gap-3.5">
          <h2 id="changed" className="m-0 border-b border-border pb-2 text-[15px] font-semibold">What changed {digest.date === localDay(new Date()) ? "today" : "this day"}</h2>
          {entries.length === 0 && <p className="m-0 text-muted-foreground">Nothing was captured this day. Sessions appear here as your connected tools finish them.</p>}
          {entries.map(({ session, changes }) => (
            <div key={session.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
              <span className="pt-0.5 text-[12px] text-muted-foreground">{whenLabel(session.startedAt)}</span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} title={session.title} className="min-w-0 line-clamp-2 font-semibold text-foreground">{session.title}</Link>
                  <span className="rounded bg-code px-1.5 py-px font-mono text-[11px]">{harnessNames[session.harness] ?? session.harness}</span>
                  {session.topic && (
                    <span className="text-[12px] text-muted-foreground">
                      in <Link to="/topics/$topicId" params={{ topicId: session.topic.id }}>{session.topic.path.slice(-2).join(" › ")}</Link>
                    </span>
                  )}
                </span>
                {changes.map((c, i) => (
                  <span key={i} className="flex flex-wrap items-baseline gap-2 py-0.5 leading-[1.5]">
                    <span className="w-[62px] flex-none text-[11px] font-semibold" style={{ color: changeKind[c.kind]!.color }}>{changeKind[c.kind]!.label}</span>
                    <Link to={subjectHref(c.subject)} className="font-medium">{c.subject.title}</Link>
                    <span className="min-w-40 flex-1">{c.text}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function TodayPhone({ digest }: { digest: TodayDigest }) {
  const entries = worthShowing(digest);
  return (
    <div className="flex flex-col gap-[18px] px-4 pb-4 text-[15px]">
      <Lede digest={digest} phone />
      <Health phone />
      {digest.needsYou.length > 0 && (
        <section aria-labelledby="needs-you-m" className="flex flex-col gap-2">
          <div className="flex items-baseline">
            <h2 id="needs-you-m" className="m-0 flex-1 text-[15px] font-semibold">Needs you</h2>
            <Link to="/review" className="text-[14px]">All {digest.reviewCount}</Link>
          </div>
          <div className="-mr-4 flex snap-x gap-2.5 overflow-x-auto pr-4 pb-1">
            {digest.needsYou.map((item) => (
              <Link
                key={item.id}
                to="/review"
                search={{ item: item.id }}
                className="flex w-[250px] flex-none snap-start flex-col gap-2 rounded-[14px] border bg-card p-3.5 text-foreground hover:no-underline"
                style={{ borderColor: item.group === "conflict" ? "color-mix(in srgb, var(--warning) 45%, transparent)" : "var(--border)" }}
              >
                <span className="flex items-center gap-1.5">
                  <KindTag {...reviewKindLabel[item.group]} />
                  <span className="text-[14px] font-semibold">{item.subject.title}</span>{item.subject.kind === "entity" && <SubjectType subject={item.subject} />}
                </span>
                <span className="text-[14px] leading-[1.4]">{item.group === "conflict" ? `${reviewText(item)}: ${item.options?.map((o) => o.label).join(" or ")}?` : reviewText(item)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <NextStep phone />
      <section aria-labelledby="changed-m" className="flex flex-col gap-3">
        <h2 id="changed-m" className="m-0 text-[15px] font-semibold">What changed</h2>
        {entries.map(({ session, changes }) => (
          <Link key={session.id} to="/sessions/$sessionId" params={{ sessionId: session.id }} className="flex flex-col gap-1.5 border-b border-border pb-3 text-foreground hover:no-underline">
            <span className="flex flex-wrap gap-2 text-[12px] text-muted-foreground">
              <span>{whenLabel(session.startedAt)}</span>·<span>{harnessNames[session.harness] ?? session.harness}</span>
              {session.topic && <>·<span>{session.topic.path.at(-1)}</span></>}
            </span>
            <span title={session.title} className="line-clamp-2 text-[15px] font-semibold">{session.title}</span>
            {changes.slice(0, 2).map((c, i) => (
              <span key={i} className="flex gap-2 text-[14px] leading-[1.45]">
                <span className="w-[58px] flex-none pt-0.5 text-[11px] font-semibold" style={{ color: changeKind[c.kind]!.color }}>{changeKind[c.kind]!.label}</span>
                <span>{c.text}</span>
              </span>
            ))}
          </Link>
        ))}
      </section>
    </div>
  );
}

const tint = [
  "var(--accent)",
  "color-mix(in srgb, var(--primary) 22%, transparent)",
  "color-mix(in srgb, var(--primary) 42%, transparent)",
  "color-mix(in srgb, var(--primary) 66%, transparent)",
  "var(--primary)",
];

function shiftMonth(day: string, by: number): string {
  const d = parseDay(day);
  return localDay(new Date(d.getFullYear(), d.getMonth() + by, 1));
}

function TodayAside({ digest }: { digest: TodayDigest }) {
  const first = parseDay(digest.activityByDay[0]?.date ?? digest.date);
  const month = first.toLocaleDateString("en-US", { month: "long" });
  const now = localDay(new Date());
  const next = shiftMonth(digest.date, 1);
  return (
    <aside aria-label="At a glance" className="flex w-[320px] min-w-0 flex-col gap-[22px] border-l border-border px-[18px] py-6">
      <section aria-label="Calendar" className="flex flex-col gap-2">
        <span className="flex items-center justify-between text-[12px] font-semibold text-muted-foreground uppercase">
          <span>{month}</span>
          <span className="flex gap-1">
            <Link to="/" search={{ date: shiftMonth(digest.date, -1) }} aria-label="Previous month" className="px-1 text-muted-foreground">‹</Link>
            {next <= now && <Link to="/" search={{ date: next }} aria-label="Next month" className="px-1 text-muted-foreground">›</Link>}
          </span>
        </span>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: first.getDay() }, (_, i) => <span key={`pad-${i}`} />)}
          {digest.activityByDay.map((d) => {
            const future = d.date > now;
            const label = `${parseDay(d.date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}${d.level ? "" : ", nothing captured"}`;
            return future ? (
              <span key={d.date} aria-hidden="true" className="aspect-square rounded" style={{ background: tint[0] }} />
            ) : (
              <Link
                key={d.date}
                to="/"
                search={d.date === now ? {} : { date: d.date }}
                aria-label={label}
                aria-current={d.date === digest.date ? "date" : undefined}
                className="aspect-square rounded"
                style={{ background: tint[d.level], outline: d.date === digest.date ? "2px solid var(--foreground)" : undefined, outlineOffset: 1 }}
              />
            );
          })}
        </div>
        <span className="text-[11px] text-muted-foreground">Pick a day to read its journal.</span>
      </section>
      {digest.recentlyUpdated.length > 0 && (
        <section aria-labelledby="recent" className="flex flex-col gap-2">
          <h2 id="recent" className="m-0 text-[12px] font-semibold text-muted-foreground uppercase">Recently updated</h2>
          {digest.recentlyUpdated.map((s) => (
            <Link key={s.id} to={subjectHref(s)} className="flex flex-col gap-px text-foreground hover:no-underline">
              <span className="font-medium">{s.title}</span>
              <span className="text-[12px] text-muted-foreground"><SubjectType subject={s} /></span>
            </Link>
          ))}
        </section>
      )}
    </aside>
  );
}
