import type { ChangeKind, EntityType, ReviewItem } from "@rivethub/contracts";
import type { Palette } from "../theme/tokens";

export function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function longDate(input: string): string {
  const date = new Date(input.includes("T") ? input : `${input}T12:00:00`);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function when(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (dayKey(iso) === dayKey(now.toISOString())) return clock(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function changeLabel(kind: ChangeKind | string): string {
  if (kind === "new") return "New";
  return kind.slice(0, 1).toUpperCase() + kind.slice(1);
}

export function changeColor(kind: string, palette: Palette): string {
  if (kind === "decision") return palette.success;
  if (kind === "conflict" || kind === "merge") return palette.warning;
  if (kind === "new") return palette.primary;
  if (kind === "fact" || kind === "filed") return palette.info;
  return palette.muted;
}

const GROUP_LABEL: Record<ReviewItem["group"], string> = {
  conflict: "Conflict",
  fact: "Fact",
  "new-entity": "New",
  filing: "Filing",
  tag: "Tag",
  tidy: "Tidy",
};

export function groupLabel(group: ReviewItem["group"]): string {
  return GROUP_LABEL[group];
}

export function groupColor(group: ReviewItem["group"], palette: Palette): string {
  if (group === "conflict" || group === "tidy") return palette.warning;
  if (group === "new-entity") return palette.primary;
  if (group === "fact" || group === "filing") return palette.info;
  return palette.muted;
}

export function entityTypeLabel(type: EntityType): string {
  return type.slice(0, 1).toUpperCase() + type.slice(1);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function count(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}
