import type { ChangeKind, EntityType, ReviewItem, SubjectRef } from "@rivethub/contracts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse "YYYY-MM-DD" as a local date. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export const time = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Today" for today, "Nov 4" otherwise. */
export function dayLabel(iso: string, now = new Date()): string {
  return localDay(new Date(iso)) === localDay(now) ? "Today" : shortDate(iso);
}

/** Time for today, weekday or date otherwise. */
export function whenLabel(iso: string, now = new Date()): string {
  const label = dayLabel(iso, now);
  return label === "Today" ? time(iso) : label;
}

export function longDay(day: string): string {
  return parseDay(day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86_400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export const count = (n: number) => n.toLocaleString("en-US");

export function subjectHref(s: Pick<SubjectRef, "kind" | "id">): string {
  return s.kind === "topic" ? `/topics/${s.id}` : s.kind === "entity" ? `/entities/${s.id}` : `/sessions/${s.id}`;
}

export const subjectKindLabel: Record<SubjectRef["kind"], string> = { topic: "Topic", entity: "Entity", session: "Session" };

export const changeKind: Record<ChangeKind, { label: string; color: string }> = {
  fact: { label: "Fact", color: "var(--info)" },
  decision: { label: "Decision", color: "var(--success)" },
  new: { label: "New", color: "var(--primary)" },
  filed: { label: "Filed", color: "var(--muted-foreground)" },
  conflict: { label: "Conflict", color: "var(--warning)" },
  tag: { label: "Tag", color: "var(--muted-foreground)" },
  merge: { label: "Merge", color: "var(--info)" },
};

export const entityTypes: Record<EntityType, { one: string; many: string }> = {
  machine: { one: "Machine", many: "Machines" },
  service: { one: "Service", many: "Services" },
  person: { one: "Person", many: "People" },
  repository: { one: "Repository", many: "Repositories" },
  model: { one: "Model", many: "Models" },
  agent: { one: "Agent", many: "Agents" },
  hardware: { one: "Hardware", many: "Hardware" },
  software: { one: "Software", many: "Software" },
  domain: { one: "Domain", many: "Domains" },
  database: { one: "Database", many: "Databases" },
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

/** The label on a review item's main button. */
export function primaryAction(item: ReviewItem): string {
  switch (item.group) {
    case "conflict":
      return `Take ${item.options?.[0]?.label ?? "newer"}`;
    case "new-entity":
      return "Create";
    case "filing":
      return "File";
    case "fact":
      return "Accept";
    case "tag":
    case "tidy":
      return "Apply";
  }
}

export const harnessNames: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "grok-build": "Grok Build",
  cursor: "Cursor",
  opencode: "opencode",
};
