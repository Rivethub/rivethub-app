import type { ChangeKind, ReviewItem, SubjectRef } from "@rivethub/contracts";

/** "1 session", "2 sessions". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Join a plain-language list without an Oxford comma. */
export function listSentence(items: readonly string[]): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const ACRONYMS = new Set(["ip", "os", "gpu", "gpus", "cpu", "cpus", "url", "ssh", "dns", "id", "api", "ram", "vm", "pr", "ui", "mcp", "tls", "nfs"]);

/**
 * A fact's key as a label. The entity worker writes keys as kebab-case attribute names and files
 * one-off facts under `other-`: `ip` reads "IP", `other-incident-silent-stop` reads "Incident silent stop".
 * A key a person typed with capitals or spaces is left as they wrote it.
 */
export function factLabel(key: string): string {
  if (/[A-Z ]/.test(key)) return key;
  const words = key.replace(/^other[-_]/, "").split(/[-_]+/).filter(Boolean);
  if (!words.length) return key;
  return words.map((w, i) => (ACRONYMS.has(w) ? w.replace(/s$/, "").toUpperCase() + (w.endsWith("s") && w.length > 2 && ACRONYMS.has(w.slice(0, -1)) ? "s" : "") : i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
}

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
