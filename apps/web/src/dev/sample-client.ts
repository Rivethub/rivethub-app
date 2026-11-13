import type {
  Capability,
  Change,
  CrashReport,
  EntityArticle,
  EntityId,
  EntitySummary,
  Fact,
  FactId,
  FlaggedGroup,
  IsoTime,
  ReviewItem,
  SearchPassage,
  SessionDetail,
  SessionId,
  SessionSummaryRow,
  SubjectRef,
  SummaryNode,
  TopicArticle,
  TopicId,
  TopicNode,
  TranscriptTurn,
} from "@rivethub/contracts";
import type { AppClient } from "../client/context";
import * as data from "./sample-data";
import { at, todayDate } from "./sample-data";

const CAPABILITIES: Capability[] = [
  "today", "review", "topics", "entities", "sessions", "transcript", "summary-tree", "search", "harnesses", "models", "hubs", "account",
];

const clone = <T>(v: T): T => structuredClone(v);

function flatten(nodes: TopicNode[]): TopicNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

/**
 * An in-memory hub seeded from the design boards. Writes change its state
 * so screens react the way they will against a live hub.
 */
export function createSampleClient(options: { latencyMs?: number } = {}): AppClient {
  const wait = <T>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(clone(v)), options.latencyMs ?? 0));

  const tree = data.topicTree();
  const topicById = () => new Map(flatten(tree).map((n) => [n.id as string, n]));
  const pathOf = (id: string): TopicNode[] => {
    const map = topicById();
    const out: TopicNode[] = [];
    for (let n = map.get(id); n; n = n.parentId ? map.get(n.parentId) : undefined) out.unshift(n);
    return out;
  };

  const sessions = new Map<string, SessionDetail>();
  for (const s of data.sessionSeeds) {
    const row: SessionDetail = {
      id: s.id as SessionId,
      title: s.title,
      harness: s.harness,
      startedAt: at(s.days, s.at),
      messageCount: s.n,
      visibility: s.space ? { kind: "space", space: s.space } : { kind: "private" },
      kept: s.kept ?? false,
      trashed: false,
      memoryState: "summarized",
      gist: s.gist,
      changed: (data.sessionChanges[s.id] ?? []).map((c) => ({ ...c, at: at(s.days, s.at), actor: { kind: "wiki-writer" } })),
      entities: (s.entities ?? []).map((e) => ({ id: e as EntityId, title: data.entitySeeds.find((x) => x.id === e)?.title ?? e })),
      tags: data.sessionTags[s.id] ?? [],
    };
    if (s.end) row.endedAt = at(s.days, s.end);
    if (s.cwd) row.cwd = s.cwd;
    row.resumeCommand = `${data.resumeCommands[s.harness] ?? s.harness} ${s.id === "s-retention" ? "4b81e0c2" : s.id.slice(2, 10)}`;
    if (s.topic) row.topic = { id: s.topic as TopicId, path: pathOf(s.topic).map((n) => n.name) };
    sessions.set(s.id, row);
  }
  const summaryRow = (s: SessionDetail): SessionSummaryRow => {
    const { cwd: _c, resumeCommand: _r, changed: _ch, entities: _e, tags: _t, ...row } = s;
    return row;
  };
  const sessionRows = () => [...sessions.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  const entities = new Map<string, EntityArticle>();
  for (const e of data.entitySeeds) {
    if (e.id === "nas-01") {
      entities.set(e.id, data.nas01());
      continue;
    }
    entities.set(e.id, {
      id: e.id as EntityId,
      title: e.title,
      type: e.type,
      sessionCount: e.n,
      aliases: [],
      visibility: { kind: "private" },
      lead: data.entityLeads[e.id] ?? "",
      facts: (data.entityFacts[e.id] ?? []).map(([key, value], i) => ({
        id: `${e.id}-f${i}` as FactId, key, value, since: at(5, "10:00"), pinned: false, sources: [],
      })),
      timeline: [],
      connected: [],
      sessions: [],
      tags: [],
      freshness: "sample",
    });
  }

  const extras: Record<string, data.TopicExtra> = clone(data.topicExtras);
  const extraFor = (id: string): data.TopicExtra => (extras[id] ??= { lead: "", aliases: [], decisions: [], states: {}, entities: [], tags: [] });
  const folders = new Map<string, string | null>();
  let queue: ReviewItem[] = data.reviewQueue();
  let account = clone(data.account);
  let pendingEmail: string | undefined;
  let pins: SubjectRef[] = [
    { kind: "topic", id: "rh-08" as TopicId, title: "rh 0.8 memory cut" },
    { kind: "entity", id: "nas-01" as EntityId, title: "nas-01" },
    { kind: "topic", id: "home-lab" as TopicId, title: "Home lab" },
  ];
  const history = new Map<string, Change[]>();

  const sessionsIn = (topic: string) => {
    const ids = new Set(flatten(topicById().get(topic) ? [topicById().get(topic)!] : []).map((n) => n.id as string));
    return sessionRows().filter((s) => s.topic && ids.has(s.topic.id) && !s.trashed).map(summaryRow);
  };
  const sessionsFor = (entity: string) => sessionRows().filter((s) => s.entities.some((e) => e.id === entity)).map(summaryRow);

  function article(id: TopicId): TopicArticle {
    const node = topicById().get(id);
    if (!node) throw new Error(`No topic ${id}`);
    const x = extraFor(id);
    const list = sessionsIn(id);
    const out: TopicArticle = {
      id,
      name: node.name,
      path: pathOf(id).map((n) => ({ id: n.id, name: n.name })),
      status: node.status,
      aliases: x.aliases,
      visibility: { kind: "private" },
      lead: x.lead || `${node.name} collects ${node.sessionCount} sessions${node.children.length ? ` across ${node.children.length} subtopics` : ""}.`,
      ...(x.article ? { article: x.article } : {}),
      decisions: x.decisions.map((d, i) => {
        const dec: TopicArticle["decisions"][number] = { id: `${id}-d${i}`, text: d.text, at: at(d.days, "14:00"), superseded: d.superseded ?? false };
        const src = d.source ? sessions.get(d.source) : undefined;
        if (src) dec.source = { id: src.id, title: src.title };
        return dec;
      }),
      subtopics: node.children.map((c) => ({ id: c.id, name: c.name, state: x.states[c.id] ?? `${c.status === "closed" ? "Done" : "Open"} · ${c.sessionCount} sessions` })),
      sessions: list,
      sessionCount: node.sessionCount,
      entities: x.entities.map((e) => ({ id: e as EntityId, title: entities.get(e)?.title ?? e })),
      tags: x.tags,
      freshness: "sample",
    };
    if (x.current) out.current = x.current;
    const folder = folders.has(id) ? folders.get(id) : x.folder;
    if (folder) out.folder = folder;
    return out;
  }

  function factAsOf(f: Fact, asOf: IsoTime): Fact | null {
    if (f.since <= asOf) return f;
    if (f.previous && asOf < f.previous.until) {
      const { previous: _p, conflict: _c, ...rest } = f;
      return { ...rest, value: f.previous.value, since: f.previous.until };
    }
    return null;
  }

  function record(subject: SubjectRef, kind: Change["kind"], text: string) {
    const list = history.get(subject.id) ?? [];
    list.unshift({ kind, subject, text, at: new Date().toISOString() as IsoTime, actor: { kind: "you" } });
    history.set(subject.id, list);
  }

  function applyDecision(item: ReviewItem, value: string | undefined) {
    const entity = item.subject.kind === "entity" ? entities.get(item.subject.id) : undefined;
    if (item.group === "conflict" && entity && value !== undefined) {
      const fact = entity.facts.find((f) => f.key === item.text);
      if (fact) {
        fact.value = value;
        delete fact.conflict;
      }
      return;
    }
    if (item.group === "fact" && entity) {
      const [key, ...rest] = (value ?? item.after ?? item.text).split(": ");
      const text = rest.join(": ");
      entity.facts.push({ id: `${entity.id}-r${entity.facts.length}` as FactId, key: text ? key! : "Note", value: text || key!, since: new Date().toISOString() as IsoTime, pinned: false, sources: item.evidence.map((e) => ({ session: e.session, at: e.at, value: e.quote })) });
      return;
    }
    if (item.group === "new-entity" && !entities.has(item.subject.id)) {
      entities.set(item.subject.id, {
        id: item.subject.id as EntityId, title: item.subject.title, type: item.after?.startsWith("Machine") ? "machine" : "software", sessionCount: item.evidence.length,
        aliases: [], visibility: { kind: "private" }, lead: value ?? item.text, facts: [], timeline: [], connected: [], sessions: [], tags: [], freshness: "sample",
      });
      return;
    }
    if (item.group === "filing" && item.subject.kind === "session") {
      const s = sessions.get(item.subject.id);
      const topic = value ?? item.after;
      if (s && topic && topicById().has(topic)) s.topic = { id: topic as TopicId, path: pathOf(topic).map((n) => n.name) };
    }
  }

  const crash: CrashReport = {
    schema: 1,
    installId: "8f2c1d7e-4b3a-4c6d-9e1f-2a3b4c5d6e7f",
    rh: "0.8.0",
    os: "linux-x86_64",
    job: "embedder",
    kind: "panic",
    where: "workers::embed::handler:142",
    frames: ["workers::embed::handler:142", "workers::embed::run:88", "tokio::runtime::task:417"],
    at: at(1, "03:12"),
  };

  const client: AppClient = {
    capabilities: () => wait(Object.fromEntries(CAPABILITIES.map((c) => [c, "sample"])) as Record<Capability, "sample">),

    today(date) {
      const day = date ?? todayDate();
      const onDay = sessionRows().filter((s) => {
        const d = new Date(s.startedAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === day;
      });
      const changes = onDay.reduce((n, s) => n + Math.max(s.changed.length, 1), 0);
      const isToday = day === todayDate();
      const [y, m] = day.split("-").map(Number);
      const days = new Date(y!, m!, 0).getDate();
      return wait({
        date: day,
        headline: isToday ? `Today your agents learned ${changes + 3} things` : onDay.length ? `Your agents learned ${changes} things` : "A quiet day",
        summary: isToday
          ? "You planned the [rh 0.8 memory cut](/topics/rh-08), settled how harnesses connect, and found why Codex stopped capturing. [nas-01](/entities/nas-01) moved its backup to 03:00."
          : onDay.length
            ? `You worked on ${onDay.map((s) => s.title).join(", ")}.`
            : "No sessions were captured on this day.",
        needsYou: isToday ? [queue.find((i) => i.group === "conflict"), queue.find((i) => i.group === "new-entity"), queue.find((i) => i.group === "filing")].filter((i): i is ReviewItem => !!i) : [],
        reviewCount: queue.length,
        entries: onDay.map((s) => ({ session: summaryRow(s), changes: s.changed })),
        activityByDay: Array.from({ length: days }, (_, i) => {
          const d = `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const level = d > todayDate() ? 0 : d === todayDate() ? 4 : data.activityLevels[i % data.activityLevels.length]!;
          return { date: d, level: level as 0 | 1 | 2 | 3 | 4 };
        }),
        recentlyUpdated: [
          { kind: "entity", id: "nas-01" as EntityId, title: "nas-01" },
          { kind: "topic", id: "rh-08" as TopicId, title: "rh 0.8 memory cut" },
          { kind: "topic", id: "capture-hooks" as TopicId, title: "Capture hooks" },
          { kind: "entity", id: "embed-server" as EntityId, title: "embed-server" },
        ],
        freshness: "sample",
      });
    },

    reviewQueue: () => wait(queue),
    async decide(id, decision) {
      const item = queue.find((i) => i.id === id);
      if (!item) return wait(undefined);
      if (decision.kind === "later") {
        queue = [...queue.filter((i) => i.id !== id), item];
        return wait(undefined);
      }
      queue = queue.filter((i) => i.id !== id);
      if (decision.kind === "accept") applyDecision(item, item.group === "conflict" ? item.options?.[0]?.value : undefined);
      if (decision.kind === "choose" || decision.kind === "edit") applyDecision(item, decision.value);
      if (decision.kind !== "reject") record(item.subject, item.group === "conflict" ? "conflict" : "fact", `You accepted: ${item.text}`);
      return wait(undefined);
    },

    topicTree: () => wait(tree),
    topic: (id) => wait(article(id)),
    async createTopic(name, parentId) {
      const id = `t-${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now().toString(36)}` as TopicId;
      const node: TopicNode = { id, name, sessionCount: 0, status: "open", children: [], ...(parentId ? { parentId } : {}) };
      const parent = parentId ? topicById().get(parentId) : undefined;
      if (parent) parent.children.push(node);
      else tree.push(node);
      return wait(id);
    },
    async updateTopic(id, patch) {
      const node = topicById().get(id);
      if (!node) throw new Error(`No topic ${id}`);
      if (patch.name !== undefined) node.name = patch.name;
      if (patch.aliases !== undefined) extraFor(id).aliases = patch.aliases;
      if (patch.folder !== undefined) folders.set(id, patch.folder);
      record({ kind: "topic", id, title: node.name }, "fact", `You edited ${Object.keys(patch).join(", ")}.`);
      return wait(undefined);
    },
    async addDecision(id, text) {
      extraFor(id).decisions.unshift({ text, days: 0 });
      record({ kind: "topic", id, title: topicById().get(id)?.name ?? id }, "decision", text);
      return wait(undefined);
    },
    async placeSession(session, topic) {
      const s = sessions.get(session);
      if (s) {
        if (topic) s.topic = { id: topic, path: pathOf(topic).map((n) => n.name) };
        else delete s.topic;
      }
      return wait(undefined);
    },

    entities: (type) =>
      wait(
        [...entities.values()]
          .filter((e) => !type || e.type === type)
          .map(({ id, title, type: t, sessionCount }): EntitySummary => ({ id, title, type: t, sessionCount })),
      ),
    entity(id, asOf) {
      const e = entities.get(id);
      if (!e) return Promise.reject(new Error(`No entity ${id}`));
      const full: EntityArticle = { ...clone(e), sessions: sessionsFor(id) };
      if (!asOf) return wait(full);
      return wait({
        ...full,
        facts: full.facts.map((f) => factAsOf(f, asOf)).filter((f): f is Fact => !!f),
        timeline: full.timeline.filter((t) => t.at <= asOf),
        sessions: full.sessions.filter((s) => s.startedAt <= asOf),
      });
    },
    async setFact(entityId, fact) {
      const e = entities.get(entityId);
      if (!e) throw new Error(`No entity ${entityId}`);
      const now = new Date().toISOString() as IsoTime;
      const existing = fact.id ? e.facts.find((f) => f.id === fact.id) : undefined;
      if (existing) {
        if (existing.value !== fact.value) existing.previous = { value: existing.value, until: now };
        Object.assign(existing, { key: fact.key, value: fact.value, pinned: fact.pinned });
        if (existing.value !== fact.value) existing.since = now;
      } else {
        e.facts.push({ id: `${entityId}-u${e.facts.length}` as FactId, key: fact.key, value: fact.value, pinned: fact.pinned, since: now, sources: [] });
      }
      e.timeline.unshift({ at: now, kind: "fact", text: `You set ${fact.key} to ${fact.value}${fact.pinned ? " and pinned it" : ""}.` });
      return wait(undefined);
    },

    sessions(query) {
      const text = query.text?.toLowerCase();
      const items = sessionRows().filter((s) => {
        const view = query.view ?? "all";
        if (view === "trash" ? !s.trashed : s.trashed) return false;
        if (view === "unfiled" && s.topic) return false;
        if (view === "kept" && !s.kept) return false;
        if (query.harness && s.harness !== query.harness) return false;
        if (query.topic && s.topic?.id !== query.topic) return false;
        if (text && ![s.title, s.harness, ...(s.topic?.path ?? [])].join(" ").toLowerCase().includes(text)) return false;
        return true;
      });
      return wait({ items: items.map(summaryRow) });
    },
    session(id) {
      const s = sessions.get(id);
      return s ? wait(s) : Promise.reject(new Error(`No session ${id}`));
    },
    transcript(id, range) {
      const s = sessions.get(id);
      if (!s) return Promise.reject(new Error(`No session ${id}`));
      const turns: TranscriptTurn[] = id === "s-retention"
        ? data.retentionTranscript()
        : Array.from({ length: s.messageCount }, (_, i) => ({
            index: i + 1,
            role: i === 0 ? "user" : "assistant",
            at: s.startedAt,
            parts: i === 0 ? [{ kind: "text", text: s.title }] : i === s.messageCount - 1 ? [{ kind: "text", text: s.gist ?? "Done." }] : [{ kind: "tool", name: "shell", summary: `Step ${i + 1}` }],
          }));
      return wait(range ? turns.filter((t) => t.index >= range[0] && t.index <= range[1]) : turns);
    },
    summaryTree(id) {
      const s = sessions.get(id);
      if (!s) return Promise.reject(new Error(`No session ${id}`));
      if (id === "s-retention") return wait(data.retentionSummary());
      const half = Math.ceil(s.messageCount / 2);
      const leaf = (a: number, b: number, text: string): SummaryNode => ({ level: "leaf", text, messageRange: [a, b], children: [] });
      return wait({
        level: "root", title: "Whole session", text: s.gist ?? s.title, messageRange: [1, s.messageCount], model: "claude-cli opus", at: s.endedAt ?? s.startedAt,
        children: [
          { level: "branch", title: "Getting oriented", text: "Read the code and the ask.", messageRange: [1, half], children: [leaf(1, half, `Started on: ${s.title}.`)] },
          { level: "branch", title: "Making the change", text: s.gist ?? "Did the work.", messageRange: [half + 1, s.messageCount], children: [leaf(half + 1, s.messageCount, s.gist ?? "Finished.")] },
        ],
      });
    },
    async renameSession(id, title) {
      const s = sessions.get(id);
      if (s) s.title = title;
      return wait(undefined);
    },
    async setVisibility(id, visibility) {
      const s = sessions.get(id);
      if (s) s.visibility = visibility;
      return wait(undefined);
    },
    async keep(id, keep) {
      const s = sessions.get(id);
      if (s) s.kept = keep;
      return wait(undefined);
    },
    async trash(ids) {
      for (const id of ids) {
        const s = sessions.get(id);
        if (s) s.trashed = true;
      }
      return wait(undefined);
    },
    async restore(ids) {
      for (const id of ids) {
        const s = sessions.get(id);
        if (s) s.trashed = false;
      }
      return wait(undefined);
    },
    async tag(id, key, value, op) {
      const s = sessions.get(id);
      if (!s) return wait(undefined);
      const rest = s.tags.filter((t) => !(t.key === key && t.value === value));
      if (op === "add" || op === "accept") s.tags = [...rest, { key, value, state: "applied" }];
      else s.tags = rest;
      return wait(undefined);
    },

    search(text, options = {}) {
      const t = text.trim().toLowerCase();
      if (!t) return wait({ goTo: [], actions: [] });
      const cutoff = options.window ? Date.now() - { today: 1, yesterday: 2, last_7d: 7, last_14d: 14 }[options.window] * 86_400_000 : 0;
      const passages: SearchPassage[] = [];
      for (const s of sessionRows()) {
        if (s.trashed || new Date(s.startedAt).getTime() < cutoff) continue;
        const session = { id: s.id, title: s.title };
        if (options.scope !== "messages" && s.gist?.toLowerCase().includes(t)) passages.push({ id: `${s.id}:sum`, session, source: "summary", text: s.gist, at: s.endedAt ?? s.startedAt });
        if (options.scope === "summaries") continue;
        const turns = s.id === "s-retention" ? data.retentionTranscript() : [{ index: 1, role: "user" as const, at: s.startedAt, parts: [{ kind: "text" as const, text: s.title }] }];
        for (const turn of turns) {
          for (const part of turn.parts) {
            const body = part.kind === "text" ? part.text : part.summary;
            if (body.toLowerCase().includes(t)) passages.push({ id: `${s.id}:${turn.index}`, session, source: "message", text: body, at: turn.at, role: part.kind === "tool" ? "tool" : turn.role });
          }
        }
      }
      const hits = [
        ...[...entities.values()].filter((e) => e.title.toLowerCase().includes(t) || e.aliases.some((a) => a.toLowerCase().includes(t))).map((e) => ({
          subject: { kind: "entity", id: e.id, title: e.title } as SubjectRef,
          snippet: e.lead,
          context: [e.type[0]!.toUpperCase() + e.type.slice(1), e.topic?.path.join(" › ")].filter(Boolean).join(" · "),
        })),
        ...sessionRows().filter((s) => s.title.toLowerCase().includes(t) || s.gist?.toLowerCase().includes(t)).map((s) => ({
          subject: { kind: "session", id: s.id, title: s.title } as SubjectRef,
          snippet: s.gist ?? "",
          context: `Session · ${s.harness}`,
        })),
        ...flatten(tree).filter((n) => n.name.toLowerCase().includes(t) || extraFor(n.id).lead.toLowerCase().includes(t)).map((n) => ({
          subject: { kind: "topic", id: n.id, title: n.name } as SubjectRef,
          snippet: extraFor(n.id).lead,
          context: ["Topic", ...pathOf(n.id).slice(0, -1).map((p) => p.name)].join(" · "),
        })),
      ].slice(0, 6);
      const top = hits.find((h) => h.subject.kind === "entity");
      const actions: { id: string; label: string; hint?: string }[] = [];
      if (top) {
        const conflict = queue.find((i) => i.group === "conflict" && i.subject.id === top.subject.id);
        if (conflict) actions.push({ id: `/review?item=${conflict.id}`, label: `Resolve the ${conflict.text.toLowerCase()} conflict on ${top.subject.title}`, hint: `${conflict.options?.length ?? 2} sessions disagree` });
        actions.push({ id: `/entities/${top.subject.id}?asOf=pick`, label: `Show ${top.subject.title} as of…`, hint: "Pick a date on the State panel" });
        actions.push({ id: `/entities/${top.subject.id}?addFact=1`, label: `Add a fact to ${top.subject.title}` });
      }
      const degraded = options.mode === "meaning" ? "Meaning search needs an embedding model. Showing word matches instead." : undefined;
      return wait({ goTo: hits, actions, passages: passages.slice(0, 30), ...(degraded ? { degraded } : {}) });
    },

    harnesses: () => wait(data.harnesses),
    async connectHarness(id, part, options) {
      const h = data.harnesses.find((x) => x.id === id);
      if (h && !options?.dryRun) {
        if (part === "capture") h.capture.state = "receiving";
        else h.recall.state = "connected";
      }
      const file = h?.path ?? `~/.${id}/config`;
      return wait({
        diff: `--- ${file}\n+++ ${file}\n@@\n+[hooks.session_end]\n+command = "rh capture --harness ${id}"\n+[mcp_servers.rivethub]\n+command = "rh mcp"\n`,
        backupPath: options?.dryRun ? "" : `${file}.rh-backup`,
      });
    },
    modelJobs: () => wait(data.modelJobs),
    hubs: () => wait(data.hubs),
    account: () => wait(account),
    async updateAccount(patch) {
      account = { ...account, ...patch };
      return wait(undefined);
    },

    pins: () => wait(pins),
    async setPinned(ref, pinned) {
      pins = pins.filter((p) => p.id !== ref.id);
      if (pinned) pins.push(ref);
      return wait(undefined);
    },
    libraryCounts: () => wait({ topics: 64, entities: 148, sessions: 1284 }),
    upkeep: (() => {
      let flagged: FlaggedGroup[] = [
        { id: "j-401", task: "Summarize session", cause: "The summarizer model answered 401: the API key was rotated.", count: 3, lastFailedAt: data.at(0, "11:58") },
      ];
      const drop = (id: string) => {
        flagged = flagged.filter((g) => g.id !== id);
        return wait(undefined);
      };
      return {
        stats: () =>
          wait({
            sessions: 1284,
            messages: 48210,
            toolCalls: 19644,
            summaries: 3907,
            searchable: { embedded: 48012, waiting: 198, failed: 0 },
            filing: { byCategorizer: 1102, byYou: 141, notFiled: 4, leftOut: 37, correctionsLastWeek: 6 },
            wiki: { topicPages: 64, entities: 148, entityTypes: [{ name: "machines", count: 41 }, { name: "services", count: 38 }, { name: "people", count: 22 }, { name: "repositories", count: 19 }], loosePages: 2 },
            workers: [
              { id: "embedder" as const, lastFinishedAt: data.at(0, "14:03"), failing: 0 },
              { id: "summarizer" as const, lastFinishedAt: data.at(0, "11:52"), failing: flagged.length ? 3 : 0 },
              { id: "categorizer" as const, lastFinishedAt: data.at(0, "14:04"), failing: 0 },
              { id: "wiki-builder" as const, lastFinishedAt: data.at(0, "14:06"), failing: 0 },
            ],
            toTidy: queue.length,
          }),
        flagged: () => wait(flagged),
        retry: drop,
        dismiss: drop,
      };
    })(),
    lastCrashReport: () => wait({ report: crash, sentAt: at(1, "03:12") }),
    async changes(query) {
      const topic = query.subject && topicById().has(query.subject) ? article(query.subject as TopicId) : undefined;
      const fromDecisions: Change[] = (topic?.decisions ?? []).map((d) => {
        const c: Change = { kind: "decision", subject: { kind: "topic", id: topic!.id, title: topic!.name }, text: d.superseded ? `${d.text} (superseded)` : d.text, at: d.at, actor: { kind: "wiki-writer" } };
        if (d.source) c.source = { kind: "session", id: d.source.id, title: d.source.title };
        return c;
      });
      const fromEntity: Change[] = (query.subject ? (entities.get(query.subject)?.timeline ?? []) : []).map((t) => {
        const c: Change = { kind: t.kind, subject: { kind: "entity", id: query.subject as EntityId, title: entities.get(query.subject!)!.title }, text: t.text, at: t.at, actor: { kind: "wiki-writer" } };
        if (t.source) c.source = { kind: "session", id: t.source.id, title: t.source.title };
        return c;
      });
      const mine = [...(query.subject ? (history.get(query.subject) ?? []) : []), ...fromDecisions, ...fromEntity];
      return wait(mine.sort((a, b) => b.at.localeCompare(a.at)));
    },
    async signIn(email) {
      pendingEmail = email;
      return wait({ requestId: "sample-request" });
    },
    async pollSignIn() {
      if (pendingEmail === undefined) throw new Error("No sign-in is waiting");
      account = { ...account, email: pendingEmail, updateSource: "rivethub-cloud" };
      pendingEmail = undefined;
      return wait({ status: "signed-in" as const, account });
    },
    async signOut() {
      const { email: _email, ...rest } = account;
      account = { ...rest, updateSource: "github" };
      return wait(account);
    },
    async deleteAccount() {
      const { email: _email, ...rest } = account;
      account = { ...rest, updateSource: "github" };
      return wait(account);
    },
  };
  return client;
}
