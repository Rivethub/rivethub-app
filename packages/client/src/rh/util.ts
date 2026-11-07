import type { SessionDetail, SessionId, SessionSummaryRow, TopicId, Visibility } from "@rivethub/contracts";

export function strip<T>(value: { [K in keyof T]: T[K] | undefined }): T {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = item;
  return out as T;
}

export const sessionId = (raw: string) => raw as SessionId;
export const topicId = (raw: string) => raw as TopicId;

/** rh addresses a session in a path as the unpadded base64url of its canonical id. */
export function sessionSegment(id: string): string {
  const bytes = new TextEncoder().encode(id);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function harnessOf(id: string): string {
  const colon = id.indexOf(":");
  return colon === -1 ? id : id.slice(0, colon);
}

export function visibilityFromWire(text: string | undefined): Visibility {
  return text === undefined || text === "private" ? { kind: "private" } : { kind: "space", space: text };
}

export function visibilityToWire(visibility: Visibility): string {
  return visibility.kind === "private" ? "private" : visibility.space;
}

export function toRow(detail: SessionDetail): SessionSummaryRow {
  const { cwd: _cwd, resumeCommand: _resume, changed: _changed, entities: _entities, tags: _tags, ...row } = detail;
  return row;
}
