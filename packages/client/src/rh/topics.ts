import type {
  Decision,
  EntityId,
  SessionSummaryRow,
  TopicArticle,
  TopicId,
  TopicNode,
} from "@rivethub/contracts";
import type { Http } from "../http.js";
import { NotFoundError } from "../errors.js";
import * as wire from "./wire.js";
import { displayTitle, harnessOf, sessionId, strip, topicId, visibilityFromWire, visibilityToWire } from "./util.js";
import type { Visibility } from "@rivethub/contracts";
import type { z } from "zod";

export type TopicIndex = ReadonlyMap<string, wire.TopicSummary>;

export function indexTopics(topics: wire.TopicSummary[]): TopicIndex {
  return new Map(topics.map((topic) => [topic.id, topic]));
}

export function topicPath(index: TopicIndex, id: string): wire.TopicSummary[] {
  const path: wire.TopicSummary[] = [];
  const seen = new Set<string>();
  for (let at = index.get(id); at && !seen.has(at.id); at = at.parent === undefined ? undefined : index.get(at.parent)) {
    seen.add(at.id);
    path.unshift(at);
  }
  return path;
}

export function topicStatus(topic: wire.TopicRecord): "open" | "closed" {
  return topic.closedAt === undefined ? "open" : "closed";
}

export function buildTree(topics: wire.TopicSummary[]): TopicNode[] {
  const nodes = new Map<string, TopicNode>();
  for (const topic of topics) {
    nodes.set(
      topic.id,
      strip<TopicNode>({
        id: topicId(topic.id),
        name: topic.name,
        parentId: topic.parent === undefined ? undefined : topicId(topic.parent),
        sessionCount: topic.sessionCount,
        lastActivity: topic.lastActive,
        status: topicStatus(topic),
        children: [],
      }),
    );
  }
  const roots: TopicNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === undefined ? undefined : nodes.get(node.parentId);
    (parent ? parent.children : roots).push(node);
  }
  const byRecency = (a: TopicNode, b: TopicNode) =>
    (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "") || a.name.localeCompare(b.name);
  const sort = (list: TopicNode[]) => {
    list.sort(byRecency);
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

export function sessionRow(
  entry: z.infer<typeof wire.topicSession>,
  index: TopicIndex,
): SessionSummaryRow {
  const topic = entry.topicId === undefined ? undefined : index.get(entry.topicId);
  const when = entry.lastActive ?? entry.at;
  return strip<SessionSummaryRow>({
    id: sessionId(entry.sessionId),
    title: displayTitle(entry.title ?? "", entry.sessionId),
    harness: harnessOf(entry.sessionId),
    startedAt: (when ?? new Date(0).toISOString()) as SessionSummaryRow["startedAt"],
    endedAt: when,
    messageCount: 0,
    topic: topic ? { id: topicId(topic.id), path: topicPath(index, topic.id).map((step) => step.name) } : undefined,
    visibility: visibilityFromWire(entry.visibility),
    kept: false,
    trashed: false,
    memoryState: "queued",
  });
}

function lead(page: z.infer<typeof wire.wikiPage> | undefined, name: string): string {
  const article = page?.article ?? page?.currentState ?? "";
  const first = article
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block !== "" && !block.startsWith("#"));
  return first ?? name;
}

export function topicArticle(
  page: z.infer<typeof wire.topicPage>,
  decisions: z.infer<typeof wire.topicDecision>[],
  placed: z.infer<typeof wire.topicSession>[],
  topics: wire.TopicSummary[],
): TopicArticle {
  const index = indexTopics(topics);
  const record = page.topic;
  const rows = placed.map((entry) => sessionRow(entry, index));
  const titles = new Map(rows.map((row) => [row.id as string, row.title]));
  const mapped: Decision[] = decisions.map((decision) => {
    const source = decision.sessionId === undefined ? undefined : titles.get(decision.sessionId);
    return strip<Decision>({
      id: decision.id,
      text: decision.text,
      at: decision.createdAt,
      superseded: decision.status === "superseded",
      source:
        decision.sessionId !== undefined && source !== undefined
          ? { id: sessionId(decision.sessionId), title: source }
          : undefined,
    });
  });
  return strip<TopicArticle>({
    id: topicId(record.id),
    name: record.name,
    path: topicPath(index, record.id).map((step) => ({ id: topicId(step.id), name: step.name })),
    status: topicStatus(record),
    aliases: record.aliases,
    folder: record.directory?.path,
    visibility: visibilityFromWire(record.visibility),
    lead: lead(page.page, record.name),
    article: page.page?.article || undefined,
    current: page.page?.currentState === "" ? undefined : page.page?.currentState,
    decisions: mapped,
    subtopics: topics
      .filter((topic) => topic.parent === record.id)
      .map((topic) => ({ id: topicId(topic.id), name: topic.name, state: topicStatus(topic) })),
    sessions: rows,
    sessionCount: index.get(record.id)?.sessionCount ?? rows.length,
    entities: page.mentions.map((mention) => ({ id: mention.topicId as EntityId, title: mention.name })),
    tags: (page.page?.tags ?? []).map((tag) => ({ key: "tag", value: tag, state: "applied" as const })),
    freshness: "live",
  });
}

export function topicsApi(http: Http) {
  const topics = () => http.get("/api/topics", wire.topicList).then((list) => list.topics);
  const key = (id: string) => encodeURIComponent(id);

  return {
    async topicTree(): Promise<TopicNode[]> {
      return buildTree(await topics());
    },

    async topic(id: TopicId): Promise<TopicArticle> {
      const [all, page, decisions, placed] = await Promise.all([
        topics(),
        http.get(`/api/topics/${key(id)}/page`, wire.topicPage),
        http.get(`/api/topics/${key(id)}/decisions`, wire.topicDecisionList),
        http.get(`/api/topics/${key(id)}/sessions`, wire.topicSessionList),
      ]);
      if (!page.topic) throw new NotFoundError(`topic ${id}`);
      return topicArticle(page, decisions.decisions, placed.sessions, all);
    },

    async updateTopic(
      id: TopicId,
      patch: { name?: string; aliases?: string[]; parentId?: TopicId | null; folder?: string | null },
    ): Promise<void> {
      const body = strip<Record<string, unknown>>({
        name: patch.name,
        aliases: patch.aliases,
        parent: patch.parentId,
        directory: patch.folder === undefined ? undefined : patch.folder === null ? null : { kind: "shared", path: patch.folder },
      });
      await http.send("PATCH", `/api/topics/${key(id)}`, body);
    },

    async createTopic(name: string, parentId?: TopicId): Promise<TopicId> {
      const created = await http.sendFor("POST", "/api/topics", wire.createdTopic, strip<Record<string, unknown>>({ kind: "work", name, parent: parentId }));
      return topicId(created.id);
    },

    async addDecision(id: TopicId, text: string): Promise<void> {
      await http.send("POST", `/api/topics/${key(id)}/decisions`, { text });
    },

    async setTopicVisibility(id: TopicId, visibility: Visibility): Promise<void> {
      await http.send("PATCH", `/api/topics/${key(id)}/visibility`, { visibility: visibilityToWire(visibility) });
    },

    async loadTopics(): Promise<wire.TopicSummary[]> {
      return topics();
    },
  };
}

