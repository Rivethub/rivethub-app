import type {
  Account,
  Capability,
  Change,
  Decision,
  EntityArticle,
  EntityId,
  EntitySummary,
  EntityType,
  Fact,
  FactId,
  HarnessId,
  HarnessStatus,
  Hub,
  IsoTime,
  MemoryClient,
  ModelJob,
  Page,
  ReviewDecision,
  ReviewItem,
  ReviewItemId,
  SearchHit,
  SearchResults,
  SessionDetail,
  SessionId,
  SessionQuery,
  SessionSummaryRow,
  SubjectRef,
  SummaryNode,
  TodayDigest,
  TopicArticle,
  TopicId,
  TopicNode,
  TranscriptTurn,
  Visibility,
} from "@rivethub/contracts";
import { ClientError, NotFoundError } from "../errors.js";
import { toRow } from "../rh/util.js";
import { buildWorld, NOW, type Effect, type SessionRec, type TopicRec, type World } from "./fixtures.js";

const PAGE_SIZE = 20;
const ALL_SAMPLE: Record<Capability, "sample"> = {
  today: "sample",
  review: "sample",
  topics: "sample",
  entities: "sample",
  sessions: "sample",
  transcript: "sample",
  "summary-tree": "sample",
  search: "sample",
  harnesses: "sample",
  models: "sample",
  hubs: "sample",
  account: "sample",
};

const clone = <T>(value: T): T => structuredClone(value);

export interface SampleClientOptions {
  now?: () => IsoTime;
}

export function createSampleClient(options: SampleClientOptions = {}): MemoryClient {
  const world: World = buildWorld();
  const now = options.now ?? (() => NOW);
  let serial = 0;
  const nextId = (prefix: string) => `${prefix}-${++serial}`;

  const topicById = (id: string): TopicRec => {
    const found = world.topics.find((rec) => rec.id === id);
    if (!found) throw new NotFoundError(`topic ${id}`);
    return found;
  };
  const sessionById = (id: string): SessionRec => {
    const found = world.sessions.find((rec) => rec.detail.id === id);
    if (!found) throw new NotFoundError(`session ${id}`);
    return found;
  };
  const entityById = (id: string): EntityArticle => {
    const found = world.entities.find((entity) => entity.id === id);
    if (!found) throw new NotFoundError(`entity ${id}`);
    return found;
  };

  const pathOf = (id: TopicId): TopicRec[] => {
    const path: TopicRec[] = [];
    const seen = new Set<string>();
    for (let at = world.topics.find((rec) => rec.id === id); at && !seen.has(at.id); ) {
      seen.add(at.id);
      path.unshift(at);
      const parent = at.parentId;
      at = parent === undefined ? undefined : world.topics.find((rec) => rec.id === parent);
    }
    return path;
  };
  const within = (id: TopicId): Set<string> => {
    const ids = new Set<string>([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const rec of world.topics) {
        if (rec.parentId !== undefined && ids.has(rec.parentId) && !ids.has(rec.id)) {
          ids.add(rec.id);
          grew = true;
        }
      }
    }
    return ids;
  };

  const topicRef = (id: TopicId) => {
    const path = pathOf(id);
    return { id, path: path.map((rec) => rec.name) };
  };

  function row(rec: SessionRec): SessionSummaryRow {
    return clone(toRow(rec.detail));
  }

  const sessionsAt = (topic: TopicId): SessionRec[] => {
    const ids = within(topic);
    return world.sessions.filter((rec) => rec.detail.topic !== undefined && ids.has(rec.detail.topic.id) && !rec.detail.trashed);
  };

  function entityCount(id: string): number {
    return world.sessions.filter((rec) => !rec.detail.trashed && rec.detail.entities.some((entity) => entity.id === id)).length;
  }

  function entityView(entity: EntityArticle): EntityArticle {
    const mine = world.sessions.filter((rec) => !rec.detail.trashed && rec.detail.entities.some((e) => e.id === entity.id));
    return {
      ...clone(entity),
      sessionCount: mine.length,
      sessions: mine.sort((a, b) => b.detail.startedAt.localeCompare(a.detail.startedAt)).map(row),
    };
  }

  function applyEffect(effect: Effect | undefined, decision: ReviewDecision, item: ReviewItem): void {
    if (!effect) return;
    const value = decision.kind === "choose" || decision.kind === "edit" ? decision.value : undefined;
    switch (effect.kind) {
      case "fact": {
        const chosen = value ?? effect.value;
        if (chosen === "") return;
        const entity = entityById(effect.entity);
        const existing = entity.facts.find((fact) => fact.key === effect.key);
        writeFact(entity, { ...(existing ? { id: existing.id } : {}), key: effect.key, value: chosen, pinned: existing?.pinned ?? false }, item);
        return;
      }
      case "place":
        placeSession(effect.session, effect.topic);
        return;
      case "new-entity": {
        if (world.entities.some((entity) => entity.id === effect.id)) return;
        world.entities.push({
          id: effect.id,
          title: effect.title,
          type: effect.entityType,
          sessionCount: 0,
          aliases: [],
          visibility: { kind: "private" },
          lead: effect.lead,
          facts: [],
          timeline: [{ at: now(), kind: "new", text: `Created from review: ${effect.lead}` }],
          connected: [],
          sessions: [],
          tags: [],
          freshness: "sample",
        });
        return;
      }
      case "tag": {
        const rec = sessionById(effect.session);
        const tag = rec.detail.tags.find((t) => t.key === effect.key && t.value === effect.value);
        if (tag) tag.state = "applied";
        else rec.detail.tags.push({ key: effect.key, value: effect.value, state: "applied" });
        return;
      }
      case "merge":
        return;
      case "none":
        return;
    }
  }

  function writeFact(entity: EntityArticle, input: { id?: FactId; key: string; value: string; pinned: boolean }, item?: ReviewItem): void {
    const at = now();
    const existing = input.id === undefined ? entity.facts.find((fact) => fact.key === input.key) : entity.facts.find((fact) => fact.id === input.id);
    if (existing) {
      if (existing.value !== input.value) {
        existing.previous = { value: existing.value, until: at };
        existing.value = input.value;
        existing.since = at;
        delete existing.conflict;
        existing.sources = item ? existing.sources : [];
      }
      existing.key = input.key;
      existing.pinned = input.pinned;
    } else {
      const fact: Fact = { id: (input.id ?? nextId(`${entity.id}-fact`)) as FactId, key: input.key, value: input.value, since: at, pinned: input.pinned, sources: [] };
      entity.facts.push(fact);
    }
    entity.timeline.unshift({ at, kind: "fact", text: item ? `Accepted from review: ${input.key} is ${input.value}.` : `You set ${input.key} to ${input.value}.` });
  }

  function placeSession(id: SessionId, topic: TopicId | null): void {
    const rec = sessionById(id);
    if (topic === null) {
      delete rec.detail.topic;
      return;
    }
    topicById(topic);
    rec.detail.topic = topicRef(topic);
  }

  function matches(rec: SessionRec, query: SessionQuery): boolean {
    const { detail } = rec;
    const view = query.view ?? "all";
    if (view === "trash" ? !detail.trashed : detail.trashed) return false;
    if (view === "unfiled" && detail.topic !== undefined) return false;
    if (view === "kept" && !detail.kept) return false;
    if (query.harness !== undefined && detail.harness !== query.harness) return false;
    if (query.topic !== undefined && !(detail.topic !== undefined && within(query.topic).has(detail.topic.id))) return false;
    if (query.text !== undefined && query.text.trim() !== "") {
      const text = query.text.trim().toLowerCase();
      if (!`${detail.title} ${detail.gist ?? ""}`.toLowerCase().includes(text)) return false;
    }
    return true;
  }

  function buildTree(): TopicNode[] {
    const nodes = new Map<string, TopicNode>();
    for (const rec of world.topics) {
      const mine = sessionsAt(rec.id);
      const latest = mine.map((s) => s.detail.endedAt ?? s.detail.startedAt).sort().at(-1) ?? rec.lastActivity;
      nodes.set(rec.id, {
        id: rec.id,
        name: rec.name,
        ...(rec.parentId === undefined ? {} : { parentId: rec.parentId }),
        sessionCount: mine.length,
        ...(latest === undefined ? {} : { lastActivity: latest }),
        status: rec.status,
        children: [],
      });
    }
    const roots: TopicNode[] = [];
    for (const rec of world.topics) {
      const node = nodes.get(rec.id);
      if (!node) continue;
      const parent = rec.parentId === undefined ? undefined : nodes.get(rec.parentId);
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  }

  function dayOf(iso: string): string {
    return iso.slice(0, 10);
  }

  const client: MemoryClient = {
    async capabilities() {
      return { ...ALL_SAMPLE };
    },

    async today(date) {
      const day = date ?? dayOf(now());
      const mine = world.sessions
        .filter((rec) => !rec.detail.trashed && dayOf(rec.detail.endedAt ?? rec.detail.startedAt) === day)
        .sort((a, b) => (b.detail.endedAt ?? "").localeCompare(a.detail.endedAt ?? ""));
      const queue = world.review;
      const needs = [...queue].sort((a, b) => order(a.group) - order(b.group)).slice(0, 3);
      const open = queue.filter((item) => item.group === "conflict").length;
      const digest: TodayDigest = {
        date: day,
        headline:
          mine.length === 0
            ? "A quiet day."
            : `${mine.length} ${mine.length === 1 ? "session" : "sessions"} captured${open > 0 ? `, ${open} ${open === 1 ? "conflict needs" : "conflicts need"} you` : ""}.`,
        summary:
          mine.length === 0
            ? "Nothing was captured on this day."
            : `Work on ${[...new Set(mine.map((rec) => rec.detail.topic?.path.at(-1) ?? "unfiled sessions"))].join(", ")}.`,
        needsYou: clone(needs),
        reviewCount: queue.length,
        entries: mine.map((rec) => ({ session: row(rec), changes: clone(rec.detail.changed) })),
        activityByDay: clone(world.activityByDay),
        recentlyUpdated: recentlyUpdated(),
        freshness: "sample",
      };
      return digest;
    },

    async reviewQueue() {
      return clone([...world.review].sort((a, b) => order(a.group) - order(b.group) || b.createdAt.localeCompare(a.createdAt)));
    },

    async decide(id: ReviewItemId, decision) {
      const item = world.review.find((candidate) => candidate.id === id);
      if (!item) throw new NotFoundError(`review item ${id}`);
      if (decision.kind === "accept" || decision.kind === "choose" || decision.kind === "edit") {
        applyEffect(world.effects.get(id), decision, item);
      }
      world.review.splice(world.review.indexOf(item), 1);
      world.effects.delete(id);
    },

    async topicTree() {
      return clone(buildTree());
    },

    async topic(id) {
      const rec = topicById(id);
      const mine = sessionsAt(id).sort((a, b) => b.detail.startedAt.localeCompare(a.detail.startedAt));
      const entities = new Map<string, { id: EntityId; title: string }>();
      for (const s of mine) for (const e of s.detail.entities) entities.set(e.id, e);
      const article: TopicArticle = {
        id: rec.id,
        name: rec.name,
        path: pathOf(rec.id).map((step) => ({ id: step.id, name: step.name })),
        status: rec.status,
        aliases: [...rec.aliases],
        ...(rec.folder === undefined ? {} : { folder: rec.folder }),
        visibility: clone(rec.visibility),
        lead: rec.lead,
        ...(rec.current === undefined ? {} : { current: rec.current }),
        decisions: clone(rec.decisions).sort((a, b) => b.at.localeCompare(a.at)),
        subtopics: world.topics
          .filter((child) => child.parentId === rec.id)
          .map((child) => {
            const count = sessionsAt(child.id).length;
            return { id: child.id, name: child.name, state: `${child.status === "closed" ? "Done" : "In progress"} · ${count} ${count === 1 ? "session" : "sessions"}` };
          }),
        sessions: mine.map(row),
        sessionCount: mine.length,
        entities: [...entities.values()],
        tags: clone(rec.tags),
        freshness: "sample",
      };
      return article;
    },

    async updateTopic(id, patch) {
      const rec = topicById(id);
      if (patch.parentId !== undefined && patch.parentId !== null) {
        topicById(patch.parentId);
        if (within(id).has(patch.parentId)) throw new ClientError("a topic cannot move inside itself");
      }
      if (patch.name !== undefined) {
        if (patch.name.trim() === "") throw new ClientError("a topic needs a name");
        rec.name = patch.name.trim();
      }
      if (patch.aliases !== undefined) rec.aliases = [...patch.aliases];
      if (patch.parentId === null) delete rec.parentId;
      else if (patch.parentId !== undefined) rec.parentId = patch.parentId;
      if (patch.folder === null) delete rec.folder;
      else if (patch.folder !== undefined) rec.folder = patch.folder;
      for (const s of world.sessions) {
        if (s.detail.topic !== undefined && within(rec.id).has(s.detail.topic.id)) s.detail.topic = topicRef(s.detail.topic.id);
      }
    },

    async addDecision(id, text) {
      const rec = topicById(id);
      const decision: Decision = { id: nextId("decision"), text, at: now(), superseded: false };
      rec.decisions.unshift(decision);
      rec.lastActivity = decision.at;
    },

    async placeSession(session, topic) {
      placeSession(session, topic);
    },

    async entities(type?: EntityType) {
      const summaries: EntitySummary[] = world.entities
        .filter((entity) => type === undefined || entity.type === type)
        .map((entity) => ({ id: entity.id, title: entity.title, type: entity.type, sessionCount: entityCount(entity.id) }));
      return summaries.sort((a, b) => b.sessionCount - a.sessionCount || a.title.localeCompare(b.title));
    },

    async entity(id, asOf) {
      const view = entityView(entityById(id));
      if (asOf === undefined) return view;
      const facts: Fact[] = [];
      for (const fact of view.facts) {
        if (fact.since <= asOf) facts.push(fact);
        else if (fact.previous !== undefined && fact.previous.until > asOf) {
          const { conflict: _conflict, previous: _previous, ...rest } = fact;
          facts.push({ ...rest, value: fact.previous.value, since: view.timeline.at(-1)?.at ?? fact.since });
        }
      }
      return { ...view, facts, timeline: view.timeline.filter((entry) => entry.at <= asOf) };
    },

    async setFact(entity, input) {
      writeFact(entityById(entity), input);
    },

    async sessions(query): Promise<Page<SessionSummaryRow>> {
      const all = world.sessions.filter((rec) => matches(rec, query)).sort((a, b) => b.detail.startedAt.localeCompare(a.detail.startedAt));
      const start = Number(query.cursor ?? 0) || 0;
      const items = all.slice(start, start + PAGE_SIZE).map(row);
      return start + PAGE_SIZE < all.length ? { items, next: String(start + PAGE_SIZE) } : { items };
    },

    async session(id): Promise<SessionDetail> {
      return clone(sessionById(id).detail);
    },

    async transcript(id, range): Promise<TranscriptTurn[]> {
      const turns = sessionById(id).turns;
      return clone(range ? turns.slice(range[0], range[1] + 1) : turns);
    },

    async summaryTree(id): Promise<SummaryNode> {
      const rec = sessionById(id);
      if (rec.summary) return clone(rec.summary);
      return {
        level: "root",
        text: rec.detail.gist ?? rec.detail.title,
        messageRange: [0, Math.max(0, rec.detail.messageCount - 1)],
        children: [],
      };
    },

    async renameSession(id, title) {
      if (title.trim() === "") throw new ClientError("a session needs a title");
      sessionById(id).detail.title = title.trim();
    },

    async setVisibility(id, visibility: Visibility) {
      sessionById(id).detail.visibility = clone(visibility);
    },

    async keep(id, keep) {
      const { detail } = sessionById(id);
      detail.kept = keep;
      if (keep) detail.trashed = false;
    },

    async trash(ids) {
      const recs = ids.map(sessionById);
      for (const rec of recs) {
        rec.detail.trashed = true;
        rec.detail.kept = false;
      }
    },

    async restore(ids) {
      for (const id of ids) sessionById(id).detail.trashed = false;
    },

    async tag(id, key, value, op) {
      const { detail } = sessionById(id);
      const at = detail.tags.findIndex((tag) => tag.key === key && tag.value === value);
      const existing = at === -1 ? undefined : detail.tags[at];
      if (op === "add") {
        if (existing) existing.state = "applied";
        else detail.tags.push({ key, value, state: "applied" });
      } else if (op === "accept") {
        if (!existing) throw new NotFoundError(`tag ${key}: ${value}`);
        existing.state = "applied";
      } else if (existing) detail.tags.splice(at, 1);
    },

    async search(text): Promise<SearchResults> {
      const q = text.trim().toLowerCase();
      const goTo: SearchHit[] = [];
      if (q !== "") {
        for (const rec of world.topics) {
          if (`${rec.name} ${rec.aliases.join(" ")}`.toLowerCase().includes(q)) {
            goTo.push({ subject: { kind: "topic", id: rec.id, title: rec.name }, snippet: rec.lead, context: pathOf(rec.id).map((s) => s.name).join(" › ") });
          }
        }
        for (const entity of world.entities) {
          const hay = `${entity.title} ${entity.aliases.join(" ")}`.toLowerCase();
          const factHit = entity.facts.find((fact) => `${fact.key} ${fact.value}`.toLowerCase().includes(q));
          if (hay.includes(q) || factHit) {
            goTo.push({
              subject: { kind: "entity", id: entity.id, title: entity.title },
              snippet: factHit && !hay.includes(q) ? `${factHit.key}: ${factHit.value}` : entity.lead,
              context: entity.type,
            });
          }
        }
        for (const rec of world.sessions) {
          if (rec.detail.trashed) continue;
          if (`${rec.detail.title} ${rec.detail.gist ?? ""}`.toLowerCase().includes(q)) {
            goTo.push({
              subject: { kind: "session", id: rec.detail.id, title: rec.detail.title },
              snippet: rec.detail.gist ?? rec.detail.title,
              context: rec.detail.harness,
            });
          }
        }
      }
      const actions = ACTIONS.filter((action) => q === "" || `${action.label} ${action.hint ?? ""}`.toLowerCase().includes(q));
      return { goTo, actions: clone(actions) };
    },

    async harnesses(): Promise<HarnessStatus[]> {
      return clone(world.harnesses);
    },

    async connectHarness(id: HarnessId, part, options) {
      const harness = world.harnesses.find((candidate) => candidate.id === id);
      if (!harness) throw new NotFoundError(`harness ${id}`);
      if (!harness.canConnect) throw new ClientError(`${harness.name} has nothing to connect`);
      const file = harness.path ?? `~/.${harness.id}/config`;
      const diff =
        part === "capture"
          ? `--- ${file}\n+++ ${file}\n@@ hooks @@\n+[hooks.rivethub]\n+command = "rh capture --harness ${harness.id}"\n`
          : `--- ${file}\n+++ ${file}\n@@ mcp @@\n+[mcp.rivethub]\n+url = "https://127.0.0.1:5174/mcp"\n`;
      if (options?.dryRun) return { diff, backupPath: "" };
      if (part === "capture") {
        harness.capture = { ...harness.capture, state: "receiving", lastCaptureAt: now(), detail: "Yes · just now" };
      } else {
        harness.recall = { state: "connected", detail: "MCP entry present" };
      }
      harness.canConnect = harness.capture.state !== "receiving" || harness.recall.state !== "connected";
      return { diff, backupPath: `${file}.rivethub-backup` };
    },

    async modelJobs(): Promise<ModelJob[]> {
      return clone(world.jobs);
    },

    async hubs(): Promise<Hub[]> {
      return clone(world.hubs);
    },

    async account(): Promise<Account> {
      return clone(world.account);
    },

    async updateAccount(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) Object.assign(world.account, { [key]: value });
      }
    },
  };

  function recentlyUpdated(): SubjectRef[] {
    const entries: { at: string; subject: SubjectRef }[] = [];
    for (const entity of world.entities) {
      const latest = entity.timeline[0]?.at;
      if (latest) entries.push({ at: latest, subject: { kind: "entity", id: entity.id, title: entity.title } });
    }
    for (const rec of world.topics) {
      if (rec.lastActivity) entries.push({ at: rec.lastActivity, subject: { kind: "topic", id: rec.id, title: rec.name } });
    }
    return entries
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 5)
      .map((entry) => entry.subject);
  }

  return client;
}

const GROUP_ORDER: ReviewItem["group"][] = ["conflict", "fact", "new-entity", "filing", "tag", "tidy"];
const order = (group: ReviewItem["group"]) => GROUP_ORDER.indexOf(group);

const ACTIONS = [
  { id: "open-review", label: "Open Review", hint: "Things waiting for you" },
  { id: "new-topic", label: "New topic", hint: "Create a topic" },
  { id: "connect-harness", label: "Connect a harness", hint: "Settings › Connections" },
  { id: "check-updates", label: "Check for updates", hint: "Settings › Account and updates" },
];

export type { Change };
