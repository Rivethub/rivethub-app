import type { EntityId, SearchHit, SearchMode, SearchOptions, SearchPassage, SearchResults } from "@rivethub/contracts";
import type { Http } from "../http.js";
import * as wire from "./wire.js";
import { z } from "zod";
import { displayTitle, sessionId, topicId } from "./util.js";

const sessionTitles = z.object({ items: z.array(z.object({ id: z.string(), title: z.string() })) });

const SNIPPET = 200;
const GO_TO_SESSIONS = 8;
const clip = (text: string) => {
  const flat = text
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > SNIPPET ? `${flat.slice(0, SNIPPET - 3)}...` : flat;
};

/** How well a name answers the words typed: the name itself, then a name that starts with them, then the rest. */
function nameRank(title: string, query: string): number {
  const name = title.trim().toLowerCase();
  if (name === query) return 0;
  return name.startsWith(query) ? 1 : 2;
}

export function mapSearch(topics: wire.TopicSummary[], memory: ReturnType<typeof wire.memorySearch.parse>, query = ""): SearchResults {
  // rh keeps topics, entities and entity types in one tree. A type ("Hosts") is not somewhere to go.
  const goTo: SearchHit[] = topics
    .filter((topic) => topic.kind !== "type")
    .map((topic) => {
      const also = topic.aliases.length > 0 ? `Also known as ${topic.aliases.slice(0, 3).join(", ")}` : undefined;
      if (topic.kind === "entity") {
        return { subject: { kind: "entity", id: topic.id as EntityId, title: topic.name }, snippet: also ?? "", context: also ? `Entity · ${also}` : "Entity" };
      }
      const sessions = `${topic.sessionCount} ${topic.sessionCount === 1 ? "session" : "sessions"}`;
      return { subject: { kind: "topic", id: topicId(topic.id), title: topic.name }, snippet: also ?? sessions, context: `Topic · ${also ?? sessions}` };
    });
  // rh ranks by how much a page says about the words. Someone typing a name wants the thing with that name first.
  const typed = query.trim().toLowerCase();
  if (typed) goTo.sort((a, b) => nameRank(a.subject.title, typed) - nameRank(b.subject.title, typed));
  const seen = new Set<string>();
  for (const hit of memory.results) {
    // The jump list stays short; every match is in `passages`.
    if (seen.size >= GO_TO_SESSIONS) break;
    if (hit.sessionId === undefined || seen.has(hit.sessionId)) continue;
    seen.add(hit.sessionId);
    const snippet = clip(hit.content);
    goTo.push({
      subject: { kind: "session", id: sessionId(hit.sessionId), title: hit.title ?? snippet.slice(0, 60) },
      snippet,
      context: hit.source === "summary" ? "Session · found in its summary" : "Session · found in a message",
    });
  }
  const passages: SearchPassage[] = [];
  for (const hit of memory.results) {
    if (hit.sessionId === undefined) continue;
    const text = clip(hit.content);
    passages.push({
      id: hit.id,
      ...(hit.owner === undefined ? {} : { owner: hit.owner }),
      session: { id: sessionId(hit.sessionId), title: hit.title ?? text.slice(0, 60) },
      source: hit.source === "summary" ? "summary" : "message",
      text,
      ...(hit.createdAt === undefined ? {} : { at: hit.createdAt }),
      ...(isRole(hit.role) ? { role: hit.role } : {}),
    });
  }
  const degraded = degradedNote(memory.degraded, memory.fallback);
  return { goTo, actions: [], passages, ...(degraded === undefined ? {} : { degraded }) };
}

/** Why the hub searched more simply than asked, in one plain sentence. */
function degradedNote(degraded: ReturnType<typeof wire.memorySearch.parse>["degraded"], fallback: string | undefined): string | undefined {
  if (degraded === undefined || degraded === false) return undefined;
  if (typeof degraded === "string") return degraded;
  const reason = degraded === true ? fallback : (degraded.reason ?? fallback);
  return reason ? `Matched by words only: ${reason}.` : "Matched by words only.";
}

const ROLES = ["user", "assistant", "tool", "system"] as const;
const isRole = (role: string | undefined): role is (typeof ROLES)[number] => ROLES.some((r) => r === role);

/** The hub's names for the ways to match. */
const MODES: Record<SearchMode, string> = { best: "hybrid", words: "fts", fuzzy: "trigram", meaning: "vector", pattern: "regex" };

export function searchApi(http: Http) {
  return {
    async search(text: string, options: SearchOptions = {}): Promise<SearchResults> {
      const q = text.trim();
      if (q === "") return { goTo: [], actions: [] };
      const [topics, memory] = await Promise.all([
        http.get("/api/topics/search", wire.topicList, { q, limit: 8, kind: "all" }),
        http.get("/api/memory/search", wire.memorySearch, {
          q,
          limit: 30,
          ...(options.window ? { window: options.window } : {}),
          ...(options.scope ? { scope: options.scope } : {}),
          ...(options.mode && options.mode !== "best" ? { mode: MODES[options.mode] } : {}),
        }),
      ]);
      const results = mapSearch(topics.topics, memory, q);
      // A standalone node's hits carry no session title. One catalog read fills them in; without it the snippet stands in.
      const untitled = new Set(memory.results.filter((hit) => hit.sessionId !== undefined && hit.title === undefined).map((hit) => hit.sessionId!));
      if (untitled.size > 0) {
        const titles = await http.get("/api/sessions", sessionTitles, { limit: 200 }).then(
          (page) => new Map(page.items.map((row) => [row.id, row.title])),
          () => new Map<string, string>(),
        );
        const titled = (id: string, fallback: string) => (untitled.has(id) ? displayTitle(titles.get(id) ?? "", id, fallback) : fallback);
        for (const hit of results.goTo) if (hit.subject.kind === "session") hit.subject.title = titled(hit.subject.id, hit.subject.title);
        for (const passage of results.passages ?? []) if (untitled.has(passage.session.id)) passage.session.title = displayTitle(titles.get(passage.session.id) ?? "", passage.session.id);
      }
      return results;
    },
  };
}
