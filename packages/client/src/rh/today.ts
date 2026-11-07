import type { ChangeQuery, TodayDigest } from "@rivethub/contracts";
import type { Http } from "../http.js";
import { mapCatalogRow } from "./catalog.js";
import { mapChange, mapReviewItem, mapSubject } from "./review.js";
import * as wire from "./wire.js";

export function todayApi(http: Http) {
  return {
    async today(date?: string): Promise<TodayDigest> {
      const digest = await http.get("/api/today", wire.todayDigest, { date });
      return {
        date: digest.date,
        headline: digest.headline,
        summary: digest.summary,
        needsYou: digest.needsYou.map(mapReviewItem),
        reviewCount: digest.reviewCount,
        entries: digest.entries.map((entry) => ({ session: mapCatalogRow(entry.session), changes: entry.changes.map(mapChange) })),
        activityByDay: digest.activityByDay,
        recentlyUpdated: digest.recentlyUpdated.map(mapSubject),
        freshness: digest.freshness,
      };
    },

    async changes(query: ChangeQuery) {
      return (await http.get("/api/changes", wire.changeList, { from: query.from, to: query.to, subject: query.subject })).map(mapChange);
    },
  };
}
