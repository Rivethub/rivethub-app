import type { SearchHit, SearchResults } from "@rivethub/contracts";
import type { Http } from "../http.js";
import * as wire from "./wire.js";
import { sessionId, topicId } from "./util.js";

const SNIPPET = 200;
const clip = (text: string) => {
  const flat = text
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > SNIPPET ? `${flat.slice(0, SNIPPET - 3)}...` : flat;
};

export function mapSearch(topics: wire.TopicSummary[], memory: ReturnType<typeof wire.memorySearch.parse>): SearchResults {
  const goTo: SearchHit[] = topics.map((topic) => ({
    subject: { kind: "topic", id: topicId(topic.id), title: topic.name },
    snippet: topic.aliases.length > 0 ? `Also known as ${topic.aliases.slice(0, 3).join(", ")}` : `${topic.sessionCount} ${topic.sessionCount === 1 ? "session" : "sessions"}`,
  }));
  const seen = new Set<string>();
  for (const hit of memory.results) {
    if (hit.sessionId === undefined || seen.has(hit.sessionId)) continue;
    seen.add(hit.sessionId);
    const snippet = clip(hit.content);
    goTo.push({
      subject: { kind: "session", id: sessionId(hit.sessionId), title: hit.title ?? snippet.slice(0, 60) },
      snippet,
      ...(hit.source === undefined ? {} : { context: hit.source }),
    });
  }
  return { goTo, actions: [] };
}

export function searchApi(http: Http) {
  return {
    async search(text: string): Promise<SearchResults> {
      const q = text.trim();
      if (q === "") return { goTo: [], actions: [] };
      const [topics, memory] = await Promise.all([
        http.get("/api/topics/search", wire.topicList, { q, limit: 8 }),
        http.get("/api/memory/search", wire.memorySearch, { q, limit: 12 }),
      ]);
      return mapSearch(topics.topics, memory);
    },
  };
}
