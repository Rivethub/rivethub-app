import type { EntityId, SessionId, SubjectRef, TopicId } from "@rivethub/contracts";

const KEY = "rivethub.pins";

/**
 * `null` until the first read. After that this is the list for the visit,
 * including a pin whose write could not be stored. A reload starts again at `null`.
 */
let cache: SubjectRef[] | null = null;

/** For tests: drop the in-memory list so the next read comes from localStorage, as a reload does. */
export function reloadPins() {
  cache = null;
}

function read(): SubjectRef[] {
  if (cache) return cache;
  try {
    cache = parsePins(localStorage.getItem(KEY));
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: SubjectRef[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota or a blocked store. This visit keeps the list; a reload forgets it.
  }
}

function same(a: SubjectRef, b: SubjectRef): boolean {
  if (a.kind !== b.kind || a.id !== b.id || a.title !== b.title) return false;
  if (a.kind === "entity" && b.kind === "entity") return a.type === b.type && a.typeName === b.typeName;
  return true;
}

export function browserPinMethods(): {
  pins(): Promise<SubjectRef[]>;
  setPinned(ref: SubjectRef, pinned: boolean): Promise<void>;
} {
  return {
    pins: () => Promise.resolve(read()),
    setPinned(ref, pinned) {
      const clean = parsePin(ref);
      if (!clean) return Promise.resolve();
      const current = read();
      const index = current.findIndex((pin) => pin.kind === clean.kind && pin.id === clean.id);
      if (pinned && index >= 0 && same(current[index]!, clean)) return Promise.resolve();
      if (!pinned && index < 0) return Promise.resolve();
      const next = current.slice();
      if (index >= 0) next.splice(index, 1);
      if (pinned) next.splice(index >= 0 ? index : next.length, 0, clean);
      write(next);
      return Promise.resolve();
    },
  };
}

function parsePins(raw: string | null): SubjectRef[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, SubjectRef>();
  const order: string[] = [];
  for (const item of value) {
    const pin = parsePin(item);
    if (!pin) continue;
    const key = `${pin.kind}\0${pin.id}`;
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, pin);
  }
  return order.map((key) => byKey.get(key)!);
}

function badString(record: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(record, key) && record[key] !== undefined && typeof record[key] !== "string";
}

/** Stored pins are untrusted. A value that is not a subject is dropped, and unknown fields are not kept. */
function parsePin(value: unknown): SubjectRef | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = record["kind"];
  const id = record["id"];
  const title = record["title"];
  if ((kind !== "topic" && kind !== "entity" && kind !== "session") || typeof id !== "string" || id.length === 0 || typeof title !== "string") return null;
  if (kind === "topic") return { kind, id: id as TopicId, title };
  if (kind === "session") return { kind, id: id as SessionId, title };
  if (badString(record, "type") || badString(record, "typeName")) return null;
  const type = typeof record["type"] === "string" ? record["type"] : undefined;
  const typeName = typeof record["typeName"] === "string" ? record["typeName"] : undefined;
  return { kind, id: id as EntityId, title, ...(type !== undefined ? { type } : {}), ...(typeName !== undefined ? { typeName } : {}) };
}
