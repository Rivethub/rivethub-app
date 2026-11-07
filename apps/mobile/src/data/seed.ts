import { createSampleClient } from "@rivethub/client";
import type { EntitySummary, ReviewItem, SessionSummaryRow, TodayDigest, TopicNode } from "@rivethub/contracts";

export interface Seed {
  today: TodayDigest;
  review: ReviewItem[];
  topics: TopicNode[];
  entities: EntitySummary[];
  sessions: SessionSummaryRow[];
}

let pending: Promise<Seed> | null = null;

export function loadSeed(): Promise<Seed> {
  pending ??= (async () => {
    const sample = createSampleClient();
    const [today, review, topics, entities, page] = await Promise.all([
      sample.today(),
      sample.reviewQueue(),
      sample.topicTree(),
      sample.entities(),
      sample.sessions({}),
    ]);
    return { today, review, topics, entities, sessions: page.items };
  })();
  return pending;
}
