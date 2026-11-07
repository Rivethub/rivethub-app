export interface PairPayload {
  url: string;
  name: string;
  token?: string;
}

export function normalizeHubUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.host) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parsePairLink(input: string): PairPayload | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "rivethub:" || url.hostname !== "pair") return null;
  const encoded = url.searchParams.get("d");
  if (!encoded) return null;
  return parsePairPayload(encoded);
}

export function parsePairPayload(encoded: string): PairPayload | null {
  let text: string;
  try {
    text = decodeBase64Url(encoded);
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const record = json as Record<string, unknown>;
  if (typeof record["url"] !== "string" || typeof record["name"] !== "string") return null;
  const url = normalizeHubUrl(record["url"]);
  const name = record["name"].trim();
  if (!url || !name || name.length > 80) return null;
  const payload: PairPayload = { url, name };
  if (typeof record["token"] === "string" && record["token"]) payload.token = record["token"];
  return payload;
}

/** Accept a pairing link or a hub URL typed or scanned from a code. */
export function parseHubInput(input: string): PairPayload | { url: string } | null {
  const paired = parsePairLink(input);
  if (paired) return paired;
  const url = normalizeHubUrl(input);
  return url ? { url } : null;
}

export function encodePairLink(payload: PairPayload): string {
  const body: PairPayload = payload.token ? payload : { url: payload.url, name: payload.name };
  return `rivethub://pair?d=${encodeBase64Url(JSON.stringify(body))}`;
}

function decodeBase64Url(input: string): string {
  const padded = input.length % 4 === 0 ? input : input + "=".repeat(4 - (input.length % 4));
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
