/** rh's default local address (`rh local`). */
export const DEFAULT_NODE_URL = "http://127.0.0.1:5174/";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

/**
 * The page the window opens, on the rh node's own origin. Only loopback
 * http(s) is accepted: the window is pinned to this origin and main will
 * hand it a login minted with the owner token.
 */
export function parseNodeUrl(raw: string | undefined): URL {
  const url = new URL(raw?.trim() || DEFAULT_NODE_URL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`RIVETHUB_DESKTOP_URL must be http or https, got ${url.protocol}`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`RIVETHUB_DESKTOP_URL must point at a loopback host, got ${url.hostname}`);
  }
  if (url.username || url.password) throw new Error("RIVETHUB_DESKTOP_URL must not carry credentials");
  url.hash = "";
  return url;
}
