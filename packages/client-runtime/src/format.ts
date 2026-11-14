import type { EntitySummary, ReviewItem, SessionOrigin, SessionSummaryRow, SubjectRef } from "@rivethub/contracts";

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

/** Labels are data: use the hub's name as given, otherwise humanize its raw value. */
export function readableName(value: string): string {
  const words = value.replace(/[-_]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function entityTypeLabel(entity: { type: string; typeName?: string | undefined }): string {
  return entity.typeName?.trim() ? entity.typeName : readableName(entity.type);
}

/** Only types present in this response exist. Group count determines order, then display name. */
export function groupEntities(entities: EntitySummary[]) {
  const groups = new Map<string, EntitySummary[]>();
  for (const entity of entities) {
    const items = groups.get(entity.type) ?? [];
    items.push(entity);
    groups.set(entity.type, items);
  }
  return [...groups].map(([type, items]) => {
    // A named row wins over an unnamed one; sort inconsistent names for deterministic responses.
    const names = items.map((e) => e.typeName).filter((name): name is string => !!name?.trim()).sort();
    return { type, label: entityTypeLabel({ type, typeName: names[0] }), items };
  }).sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label) || a.type.localeCompare(b.type));
}

/** Entity subjects can carry their type directly or resolve it from the hub's entity list. */
export function subjectLabel(subject: SubjectRef, entities: EntitySummary[]): string {
  if (subject.kind !== "entity") return subjectKindLabel[subject.kind];
  if (subject.typeName?.trim()) return subject.typeName;
  const entity = entities.find((e) => e.id === subject.id);
  return entity ? entityTypeLabel(entity) : subject.type !== undefined ? entityTypeLabel({ type: subject.type, typeName: subject.typeName }) : "Entity";
}

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
    default: return "Review";
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
  return `${who} shared this session with you.${origin.verification ? ` Verification: ${origin.verification}.` : ""}`;
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


/** Label only fact keys, leaving the value and the stored review text intact. */
export function reviewText(item: Pick<ReviewItem, "group" | "text">): string {
  if (item.group !== "fact" && item.group !== "conflict") return item.text;
  const colon = item.text.indexOf(":");
  return colon < 0 ? factLabel(item.text) : factLabel(item.text.slice(0, colon)) + item.text.slice(colon);
}
