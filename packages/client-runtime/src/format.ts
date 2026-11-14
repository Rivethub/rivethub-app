import type { EntityType, ReviewItem, SessionOrigin, SessionSummaryRow, SubjectRef } from "@rivethub/contracts";

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

export const subjectKindLabel: Record<SubjectRef["kind"], string> = { topic: "Topic", entity: "Entity", session: "Session" };

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
  shared: "Shared",
};

/** True only when the hub counted the session's messages and found none. An unknown count is not an empty session. */
export function hasNoMessages(session: Pick<SessionSummaryRow, "messageCount" | "messageCountUnknown">): boolean {
  return session.messageCount === 0 && !session.messageCountUnknown;
}

/** "From Ada", for the row of a session someone shared with this hub. */
export function originLabel(origin: SessionOrigin): string {
  return `From ${origin.author ?? "someone else"}`;
}

/** One sentence on whether the sender of a shared session is known. */
export function originNote(origin: SessionOrigin): string {
  const who = origin.author ?? "Someone else";
  if (origin.verification === "verified") return `${who} shared this session with you. It was signed with a key you trust.`;
  if (origin.verification === "unsigned") return `${who} shared this session with you. It was not signed, so the sender is not confirmed.`;
  if (origin.verification === "unknown_key") return `${who} shared this session with you. It was signed with a key you have not trusted yet, so the sender is not confirmed.`;
  return `${who} shared this session with you.`;
}
