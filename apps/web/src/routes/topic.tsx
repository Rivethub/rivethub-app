import { dayLabel, shortDate, time, whenLabel } from "@rivethub/client-runtime/format";
import type { TopicArticle, TopicId, Visibility } from "@rivethub/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useClient } from "../client/context";
import { useAddDecision, useCreateTopic, useTopic, useChanges, useTopicTree, useUpdateTopic } from "../client/queries";
import { ArticleBar, ArticleBody, ArticleTabs, Crumbs, H2, MobileBack, SessionRows, SidePanel, type Tab } from "../components/article";
import { EditableText } from "../components/editable";
import { LibraryPhone, TopicTree, TopicTreeSection } from "../components/library";
import { PinButton } from "../components/pin";
import { Frame, MainSidebar } from "../components/shell";
import { Button, Chip, ErrorNote, Eyebrow, Loading, SampleBadge, Tags } from "../components/ui";
import { changeKind, plural } from "../lib/format";
import { useIsPhone } from "../lib/media";

const route = getRouteApi("/topics/$topicId");
type TabId = "overview" | "sessions" | "history";

export const visibilityLabel = (v: Visibility) => (v.kind === "private" ? "Private" : v.space);

/** Creates a top-level topic by name and opens it. Shown only where the client can create topics. */
export function NewTopic() {
  const client = useClient();
  const create = useCreateTopic();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);
  if (!client.createTopic) return null;
  if (name === null) return <Button size="md" onClick={() => setName("")}>New topic</Button>;
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return setName(null);
    create.mutate({ name: trimmed }, { onSuccess: (id) => { setName(null); void navigate({ to: "/topics/$topicId", params: { topicId: id } }); } });
  };
  return (
    <span className="flex items-center gap-2">
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
        className="w-56 rounded-lg border border-input bg-background px-2.5 py-1.5 text-foreground outline-none focus:border-primary"
      />
      <Button variant="primary" size="md" disabled={create.isPending || !name.trim()} onClick={save}>Create</Button>
      {create.isError && <span role="alert" className="text-[13px] text-error">{create.error instanceof Error ? create.error.message : "Could not create it."}</span>}
    </span>
  );
}

/** Why a library section is empty on a new hub, and what fills it. */
export function EmptyLibrary({ kind }: { kind: "topics" | "entities" }) {
  return (
    <div className="flex max-w-[62ch] flex-col gap-2 rounded-xl border border-dashed border-input p-4 text-[14px] leading-[1.55]">
      <span className="font-semibold">{kind === "topics" ? "No topics yet" : "No entities yet"}</span>
      <span className="text-muted-foreground">
        {kind === "topics"
          ? "Topics appear when sessions are filed. With a model set, RivetHub files each session for you and asks in Review when it is unsure. Without one, create topics yourself and file sessions from each session's page; everything stays searchable either way."
          : "Entities are the machines, services, people and repositories your sessions mention. RivetHub picks them out once a model is set, and keeps a page of facts for each."}
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        <Link to="/settings/$section" params={{ section: "connections" }}>Choose a model</Link>
        <Link to="/sessions">Open Sessions</Link>
      </span>
    </div>
  );
}

export function TopicsIndex() {
  const phone = useIsPhone();
  const tree = useTopicTree();
  return (
    <Frame sidebar={<MainSidebar><TopicTreeSection /></MainSidebar>} tabs>
      {phone ? (
        <LibraryPhone kind="topics">
          <span className="px-2 pt-2.5 pb-1 text-[12px] font-semibold text-muted-foreground">ALL TOPICS</span>
          <TopicTree phone />
        </LibraryPhone>
      ) : (
        <div className="flex justify-center px-7 py-8">
          <div className="flex max-w-[820px] flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 flex flex-1 items-center gap-2 font-serif text-[34px] font-semibold">Topics <SampleBadge capability="topics" /></h1>
              <NewTopic />
            </div>
            <p className="m-0 text-muted-foreground">Every session is filed under a topic. Open one to read what your agents worked out there.</p>
            {tree.data?.length === 0 && <EmptyLibrary kind="topics" />}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
              {tree.data?.map((t) => (
                <Link key={t.id} to="/topics/$topicId" params={{ topicId: t.id }} className="flex flex-col gap-1 rounded-[10px] border border-border bg-card p-3.5 text-foreground hover:no-underline">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {plural(t.sessionCount, "session")} · {plural(t.children.length, "subtopic")}{t.lastActivity ? ` · ${whenLabel(t.lastActivity)}` : ""}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </Frame>
  );
}

export function TopicPage() {
  const { topicId } = route.useParams();
  const { tab = "overview" } = route.useSearch();
  const phone = useIsPhone();
  const topic = useTopic(topicId as TopicId);
  const history = useChanges(topicId as TopicId);
  const t = topic.data;
  const tabs: Tab<TabId>[] = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions", count: t?.sessionCount ?? 0 },
    { id: "history", label: "History", count: history.data?.length || t?.decisions.length || 0 },
  ];
  const body = topic.isPending ? <Loading /> : topic.isError ? <ErrorNote error={topic.error} /> : null;

  if (phone) {
    return (
      <Frame sidebar={null}>
        <MobileBack to={t?.path.length && t.path.length > 1 ? `/topics/${t.path.at(-2)!.id}` : "/topics"} label={t?.path.slice(0, -1).map((p) => p.name).join(" › ") || "Topics"}>
          {t && <PinButton subject={{ kind: "topic", id: t.id, title: t.name }} className="size-11" />}
        </MobileBack>
        {body ?? (
          <div className="flex flex-col gap-3.5 px-4 pb-6">
            <TopicTitle t={t!} phone />
            <ArticleTabs tabs={tabs} active={tab} search={(id) => ({ tab: id })} phone />
            <div className="flex flex-col gap-3.5 font-serif text-[16px] leading-[1.6]">
              <TopicTab t={t!} tab={tab} />
            </div>
            {tab === "overview" && <TopicSide t={t!} />}
          </div>
        )}
      </Frame>
    );
  }

  return (
    <Frame sidebar={<MainSidebar><TopicTreeSection selected={topicId} /></MainSidebar>}>
      {body ?? (
        <>
          <ArticleBar crumbs={<Crumbs items={t!.path.map((p, i) => (i < t!.path.length - 1 ? { label: p.name, to: `/topics/${p.id}` } : { label: p.name }))} />}>
            <ArticleTabs tabs={tabs} active={tab} search={(id) => ({ tab: id })} />
            <span className="ml-2 rounded-lg border border-border bg-card px-2.5 py-1 text-[12px]" title="Who can see this topic">{visibilityLabel(t!.visibility)}</span>
            <PinButton subject={{ kind: "topic", id: t!.id, title: t!.name }} />
          </ArticleBar>
          <ArticleBody side={tab === "overview" ? <TopicSide t={t!} /> : null}>
            <TopicTitle t={t!} />
            <TopicTab t={t!} tab={tab} />
          </ArticleBody>
        </>
      )}
    </Frame>
  );
}

function TopicTitle({ t, phone }: { t: TopicArticle; phone?: boolean }) {
  const tree = useTopicTree().data;
  const find = (nodes: typeof tree): NonNullable<typeof tree>[number] | undefined => {
    for (const n of nodes ?? []) {
      if (n.id === t.id) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
  };
  const last = find(tree)?.lastActivity;
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2.5">
        <h1 className={phone ? "m-0 font-serif text-[30px] leading-[1.15] font-semibold" : "m-0 font-serif text-[34px] leading-[1.15] font-semibold"}>{t.name}</h1>
        <span className="rounded-full px-2 py-0.5 font-sans text-[12px]" style={{ color: t.status === "open" ? "var(--success)" : "var(--muted-foreground)", background: `color-mix(in srgb, ${t.status === "open" ? "var(--success)" : "var(--muted-foreground)"} 14%, transparent)` }}>
          {t.status === "open" ? "Open" : "Closed"}
        </span>
        <SampleBadge capability="topics" />
      </span>
      <span className="font-sans text-[13px] text-muted-foreground">
        {plural(t.sessionCount, "session")}{last ? ` · last activity ${dayLabel(last) === "Today" ? `today ${time(last)}` : dayLabel(last)}` : ""}
      </span>
    </div>
  );
}

function TopicTab({ t, tab }: { t: TopicArticle; tab: TabId }) {
  if (tab === "sessions") return <SessionRows sessions={t.sessions} />;
  if (tab === "history") return <TopicHistory t={t} />;
  return <TopicOverview t={t} />;
}

function TopicOverview({ t }: { t: TopicArticle }) {
  const add = useAddDecision();
  const [draft, setDraft] = useState("");
  return (
    <>
      <p className="m-0">{t.lead}</p>
      {t.current && <p className="m-0 text-muted-foreground">{t.current}</p>}
      <H2>Decisions</H2>
      <div className="flex flex-col gap-1 font-sans text-[14px]">
        {t.decisions.map((d) => (
          <div key={d.id} className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-2.5 border-b border-border py-1.5" style={{ color: d.superseded ? "var(--muted-foreground)" : undefined }}>
            <span className="text-[12px] text-muted-foreground">{shortDate(d.at)}</span>
            <span className="leading-[1.5]" style={{ textDecoration: d.superseded ? "line-through" : undefined }}>
              {d.text}
              {d.superseded && <span className="sr-only"> (superseded)</span>}
            </span>
            {d.source ? <Link to="/sessions/$sessionId" params={{ sessionId: d.source.id }} className="text-[12px]" title={d.source.title}>session</Link> : <span />}
          </div>
        ))}
        <form
          className="mt-1.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            add.mutate({ id: t.id, text: draft.trim() });
            setDraft("");
          }}
        >
          <label className="flex flex-1">
            <span className="sr-only">Record a decision</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Record a decision…" className="min-w-0 flex-1 rounded-lg border border-input bg-card px-2.5 py-[7px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary" />
          </label>
        </form>
      </div>
      {t.subtopics.length > 0 && (
        <>
          <H2>Inside this topic</H2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2 font-sans text-[14px]">
            {t.subtopics.map((s) => (
              <Link key={s.id} to="/topics/$topicId" params={{ topicId: s.id }} className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2.5 text-foreground hover:no-underline">
                <span className="font-medium">{s.name}</span>
                <span className="text-[12px] text-muted-foreground">{s.state}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      <H2 right={t.sessions.length > 4 || t.sessionCount > 4 ? <Link to="." search={{ tab: "sessions" } as never}>All {t.sessionCount}</Link> : undefined}>Sessions</H2>
      <SessionRows sessions={t.sessions.slice(0, 4)} />
    </>
  );
}

function TopicHistory({ t }: { t: TopicArticle }) {
  const history = useChanges(t.id).data;
  const rows = history?.length
    ? history.map((c) => ({ at: c.at, kind: c.kind, text: c.text, source: c.source }))
    : t.decisions.map((d) => ({ at: d.at, kind: "decision" as const, text: d.text, source: d.source ? { kind: "session" as const, ...d.source } : undefined }));
  if (!rows.length) return <p className="font-sans text-muted-foreground">No changes yet.</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0 font-sans text-[14px]">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[60px_70px_minmax(0,1fr)] items-baseline gap-2.5">
          <span className="text-[12px] text-muted-foreground">{shortDate(r.at)}</span>
          <span className="text-[11px] font-semibold" style={{ color: changeKind[r.kind].color }}>{changeKind[r.kind].label}</span>
          <span className="leading-[1.5]">
            {r.text}{" "}
            {r.source && <Link to="/sessions/$sessionId" params={{ sessionId: r.source.id }} className="text-[12px]">{r.source.title}</Link>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TopicSide({ t }: { t: TopicArticle }) {
  const update = useUpdateTopic();
  const parent = t.path.at(-2);
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ id: t.id, patch });
  const [alias, setAlias] = useState<string | null>(null);
  const rows: { k: string; v: React.ReactNode }[] = [
    { k: "Inside", v: parent ? <Link to="/topics/$topicId" params={{ topicId: parent.id }}>{parent.name}</Link> : <span className="text-muted-foreground">Top level</span> },
    { k: "Folder", v: <EditableText label="Folder" mono value={t.folder ?? ""} placeholder="No folder" onSave={(v) => save({ folder: v || null })} /> },
    { k: "Status", v: t.status === "open" ? "Open" : "Closed" },
    { k: "Shared", v: visibilityLabel(t.visibility) },
  ];
  return (
    <SidePanel label="About this topic">
      <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card font-sans">
        <span className="bg-raised px-3.5 py-2.5 font-semibold">About</span>
        <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2 border-t border-border px-3.5 py-2">
          <span className="text-muted-foreground">Name</span>
          <EditableText label="Name" value={t.name} onSave={(v) => v && save({ name: v })} />
        </div>
        {rows.map((r) => (
          <div key={r.k} className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2 border-t border-border px-3.5 py-2">
            <span className="text-muted-foreground">{r.k}</span>
            <span className="min-w-0">{r.v}</span>
          </div>
        ))}
        <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-2 border-t border-border px-3.5 py-2">
          <span className="pt-0.5 text-muted-foreground">Also called</span>
          <span className="flex flex-wrap gap-1">
            {t.aliases.map((a) => (
              <span key={a} className="group inline-flex items-center gap-1 rounded-md bg-background px-1.5 py-px">
                {a}
                <button type="button" aria-label={`Remove alias ${a}`} className="-mr-1 w-0 overflow-hidden text-muted-foreground group-hover:w-auto hover:text-error focus:w-auto" onClick={() => save({ aliases: t.aliases.filter((x) => x !== a) })}>×</button>
              </span>
            ))}
            {alias === null ? (
              <button type="button" aria-label="Add an alias" onClick={() => setAlias("")} className="rounded-md border border-dashed border-input px-1.5 py-px text-[12px] text-muted-foreground">+</button>
            ) : (
              <input
                autoFocus
                aria-label="New alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                onBlur={() => setAlias(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAlias(null);
                  if (e.key === "Enter" && alias.trim()) {
                    save({ aliases: [...t.aliases, alias.trim()] });
                    setAlias(null);
                  }
                }}
                className="w-24 rounded-md border border-input bg-background px-1.5 py-px text-foreground outline-none"
              />
            )}
          </span>
        </div>
        <span className="border-t border-border px-3.5 py-2 text-[12px] text-muted-foreground">Click any value to change it. New sessions in the folder file here on their own.</span>
      </section>
      {t.entities.length > 0 && (
        <section className="flex flex-col gap-1.5 font-sans">
          <Eyebrow>Entities here</Eyebrow>
          <span className="flex flex-wrap gap-1.5">
            {t.entities.map((e) => <Chip key={e.id} to={`/entities/${e.id}`}>{e.title}</Chip>)}
          </span>
        </section>
      )}
      {t.tags.length > 0 && (
        <section className="flex flex-col gap-1.5 font-sans">
          <Eyebrow>Tags</Eyebrow>
          <Tags tags={t.tags} />
        </section>
      )}
    </SidePanel>
  );
}
