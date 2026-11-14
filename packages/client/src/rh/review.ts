import type { Change, ReviewDecision, ReviewItem, ReviewItemId, SubjectRef } from "@rivethub/contracts";
import type { Http } from "../http.js";
import * as wire from "./wire.js";
import { displayTitle } from "./util.js";
import { strip } from "./util.js";

export const mapSubject = (subject: wire.SubjectWire) =>
  strip({ ...subject, kind: subject.kind, id: subject.id, title: subject.kind === "session" ? displayTitle(subject.title, subject.id) : subject.title }) as SubjectRef;

const mapSource = (source: NonNullable<wire.ReviewWire["options"]>[number]["source"]) =>
  source && { session: { id: source.session.id, title: displayTitle(source.session.title, source.session.id) }, at: source.at, value: source.value };

export function mapReviewItem(item: wire.ReviewWire): ReviewItem {
  return strip({
    id: item.id,
    group: ["conflict", "fact", "filing", "tag", "tidy", "new-entity"].includes(item.group) ? item.group : "tidy",
    rawGroup: ["conflict", "fact", "filing", "tag", "tidy", "new-entity"].includes(item.group) ? undefined : item.group,
    subject: mapSubject(item.subject),
    text: item.text,
    before: item.before,
    after: item.after,
    options: item.options?.map((option) => strip({ label: option.label, value: option.value, source: mapSource(option.source) })),
    evidence: item.evidence.map((e) => strip({ session: e.session, at: e.at, quote: e.quote, highlight: e.highlight })),
    createdAt: item.createdAt,
  }) as ReviewItem;
}

export function mapChange(change: wire.ChangeWire): Change {
  return strip({
    kind: change.kind,
    subject: mapSubject(change.subject),
    text: change.text,
    at: change.at,
    actor: change.actor,
    source: change.source && mapSubject(change.source),
  }) as Change;
}

export function reviewApi(http: Http) {
  return {
    async reviewQueue(): Promise<ReviewItem[]> {
      return (await http.get("/api/review", wire.reviewList)).map(mapReviewItem);
    },

    decide: (id: ReviewItemId, decision: ReviewDecision) =>
      http.send("POST", `/api/review/${encodeURIComponent(id)}/decision`, decision),
  };
}
