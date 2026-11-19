import type { SessionDetail, SessionId, SessionSummaryRow, TopicId, Visibility } from "@rivethub/contracts";

export function strip<T>(value: { [K in keyof T]: T[K] | undefined }): T {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = item;
  return out as T;
}

export const sessionId = (raw: string) => raw as SessionId;
export const topicId = (raw: string) => raw as TopicId;

const IMPORT_KEY = /^import:[0-9a-f]{64}$/;

/** True for the key of a session received from someone else. */
export const isImportKey = (id: string) => IMPORT_KEY.test(id);

/**
 * rh addresses a session in a path as the unpadded base64url of its canonical id. A session received from
 * someone else is the exception: its key (`import:<digest>`) goes in the path as it is.
 */
export function sessionSegment(id: string): string {
  if (isImportKey(id)) return id;
  const bytes = new TextEncoder().encode(id);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function harnessOf(id: string): string {
  const colon = id.indexOf(":");
  return colon === -1 ? id : id.slice(0, colon);
}

export function visibilityFromWire(wire: string | Visibility | undefined): Visibility {
  if (wire !== undefined && typeof wire === "object") return wire.kind === "space" ? { kind: "space", space: wire.space } : { kind: "private" };
  return wire === undefined || wire === "private" ? { kind: "private" } : { kind: "space", space: wire };
}

export function visibilityToWire(visibility: Visibility): string {
  return visibility.kind === "private" ? "private" : visibility.space;
}

export function toRow(detail: SessionDetail): SessionSummaryRow {
  const { cwd: _cwd, resumeCommand: _resume, nativeSessionId: _native, changed: _changed, entities: _entities, tags: _tags, ...row } = detail;
  return row;
}

/**
 * rh titles a session nobody named after its id: the id itself, the harness's own id, or "Session <id>".
 * None of those mean anything to a person, so they read as `fallback`.
 */
export function displayTitle(title: string, id: string, fallback = "Untitled session"): string {
  const native = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const bare = title.trim().replace(/^Session\s+/i, "");
  return bare === "" || bare === id || bare === native ? fallback : title;
}
