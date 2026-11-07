import { normalizeHubUrl } from "./pair";

export interface HubRecord {
  id: string;
  name: string;
  url: string;
  token?: string;
}

export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const INDEX = "rivethub.hubs.index";
const CURRENT = "rivethub.hub.current";

const hubKey = (id: string) => `rivethub.hub.${id}`;

export function hubIdFor(url: string): string {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function upsertHub(hubs: HubRecord[], incoming: HubRecord): HubRecord[] {
  return [...hubs.filter((hub) => hub.id !== incoming.id && hub.url !== incoming.url), incoming];
}

export async function loadHubState(kv: Kv): Promise<{ hubs: HubRecord[]; currentId: string | null }> {
  const raw = await kv.get(INDEX);
  const ids = raw ? parseIds(raw) : [];
  const hubs: HubRecord[] = [];
  for (const id of ids) {
    const item = await kv.get(hubKey(id));
    const hub = item ? parseRecord(item) : null;
    if (hub) hubs.push(hub);
  }
  const stored = await kv.get(CURRENT);
  const currentId = stored && hubs.some((hub) => hub.id === stored) ? stored : (hubs[0]?.id ?? null);
  return { hubs, currentId };
}

export async function saveHubState(kv: Kv, hubs: HubRecord[], currentId: string | null): Promise<void> {
  const previous = parseIds((await kv.get(INDEX)) ?? "[]");
  const nextIds = hubs.map((hub) => hub.id);
  for (const id of previous) {
    if (!nextIds.includes(id)) await kv.remove(hubKey(id));
  }
  for (const hub of hubs) await kv.set(hubKey(hub.id), JSON.stringify(hub));
  await kv.set(INDEX, JSON.stringify(nextIds));
  if (currentId && nextIds.includes(currentId)) await kv.set(CURRENT, currentId);
  else await kv.remove(CURRENT);
}

function parseIds(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function parseRecord(raw: string): HubRecord | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record["id"] !== "string" || typeof record["name"] !== "string" || typeof record["url"] !== "string") return null;
    const url = normalizeHubUrl(record["url"]);
    const name = record["name"].trim();
    if (!url || !name) return null;
    const hub: HubRecord = { id: record["id"], name, url };
    if (typeof record["token"] === "string" && record["token"]) hub.token = record["token"];
    return hub;
  } catch {
    return null;
  }
}
