import type { ChangeKind, ReviewItem, SubjectRef } from "@rivethub/contracts";

export function subjectHref(s: Pick<SubjectRef, "kind" | "id">): string {
  return s.kind === "topic" ? `/topics/${s.id}` : s.kind === "entity" ? `/entities/${s.id}` : `/sessions/${s.id}`;
}

export const changeKind: Record<ChangeKind, { label: string; color: string }> = {
  fact: { label: "Fact", color: "var(--info)" },
  decision: { label: "Decision", color: "var(--success)" },
  new: { label: "New", color: "var(--primary)" },
  filed: { label: "Filed", color: "var(--muted-foreground)" },
  conflict: { label: "Conflict", color: "var(--warning)" },
  tag: { label: "Tag", color: "var(--muted-foreground)" },
  merge: { label: "Merge", color: "var(--info)" },
};

export const reviewGroups: { group: ReviewItem["group"]; title: string; filter: string; color: string; hint: string }[] = [
  { group: "conflict", title: "Conflicts", filter: "Conflicts", color: "var(--warning)", hint: "Sessions disagree. Pick one or write your own." },
  { group: "fact", title: "New facts", filter: "Facts", color: "var(--info)", hint: "Things the agent wants to add to an article." },
  { group: "new-entity", title: "New things", filter: "New things", color: "var(--primary)", hint: "Entities seen for the first time." },
  { group: "filing", title: "Filing", filter: "Filing", color: "var(--muted-foreground)", hint: "Sessions with no topic yet, with a suggested home." },
  { group: "tag", title: "Tags", filter: "Tags and tidy", color: "var(--muted-foreground)", hint: "Suggested tags." },
  { group: "tidy", title: "Tidy", filter: "Tags and tidy", color: "var(--muted-foreground)", hint: "Merges and clean-up the categorizer suggests." },
];

export const reviewKindLabel: Record<ReviewItem["group"], { label: string; color: string }> = {
  conflict: { label: "Conflict", color: "var(--warning)" },
  fact: { label: "Fact", color: "var(--info)" },
  "new-entity": { label: "New", color: "var(--primary)" },
  filing: { label: "Filed", color: "var(--muted-foreground)" },
  tag: { label: "Tag", color: "var(--muted-foreground)" },
  tidy: { label: "Tidy", color: "var(--muted-foreground)" },
};
