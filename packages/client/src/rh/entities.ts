import type { EntityArticle, EntityId, EntitySummary, EntityType, FactId, IsoTime } from "@rivethub/contracts";
import type { Http } from "../http.js";
import * as wire from "./wire.js";
import { mapRow } from "./catalog.js";
import { displayTitle, sessionId, strip, topicId } from "./util.js";

export function mapEntityArticle(article: ReturnType<typeof wire.entityArticle.parse>): EntityArticle {
  const mention = (m: { id: string; title: string }) => ({ id: sessionId(m.id), title: displayTitle(m.title, m.id) });
  const source = (s: (typeof article.facts)[number]["sources"][number]) => ({ session: mention(s.session), at: s.at, value: s.value });
  return strip<EntityArticle>({
    id: article.id as EntityId,
    title: article.title,
    type: article.type,
    typeName: article.typeName,
    sessionCount: article.sessionCount,
    aliases: article.aliases,
    topic: article.topic ? { id: topicId(article.topic.id), path: article.topic.path } : undefined,
    visibility: article.visibility,
    lead: article.lead,
    facts: article.facts.map((fact) =>
      strip({
        id: fact.id as FactId,
        key: fact.key,
        value: fact.value,
        since: fact.since,
        pinned: fact.pinned,
        sources: fact.sources.map(source),
        conflict: fact.conflict ? { candidates: fact.conflict.candidates.map(source) } : undefined,
        previous: fact.previous,
      }),
    ),
    timeline: article.timeline.map((entry) =>
      strip({ at: entry.at, text: entry.text, kind: entry.kind, source: entry.source ? mention(entry.source) : undefined }),
    ),
    connected: article.connected.map((c) => ({ id: c.id as EntityId, title: c.title, sharedSessions: c.sharedSessions })),
    sessions: article.sessions.map((row) => mapRow(row, row.visibility)),
    tags: article.tags,
    freshness: article.freshness,
  });
}

export function entitiesApi(http: Http) {
  return {
    async entities(type?: EntityType): Promise<EntitySummary[]> {
      const list = await http.get("/api/entities", wire.entityList, { type });
      return list.map((entity) => strip<EntitySummary>({ ...entity, id: entity.id as EntityId }));
    },

    async entity(id: EntityId, asOf?: IsoTime): Promise<EntityArticle> {
      // The entity route carries the page's summary and facts. The article the entity worker writes is on the
      // page itself, which every entity has as a topic of its own. An entity with no page yet has no article.
      const [article, page] = await Promise.all([
        http.get(`/api/entities/${encodeURIComponent(id)}`, wire.entityArticle, { asOf }),
        http.get(`/api/topics/${encodeURIComponent(id)}/page`, wire.topicPage).then(
          (found) => found.page,
          () => undefined,
        ),
      ]);
      const verified = page?.lastVerified ?? page?.updatedAt;
      return strip<EntityArticle>({ ...mapEntityArticle(article), article: page?.article || undefined, lastVerified: verified });
    },

    async setFact(entity: EntityId, fact: { id?: FactId; key: string; value: string; pinned: boolean }): Promise<void> {
      await http.send("PUT", `/api/entities/${encodeURIComponent(entity)}/facts`, strip(fact));
    },
  };
}
