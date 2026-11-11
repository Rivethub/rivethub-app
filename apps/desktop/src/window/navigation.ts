export function isSameOrigin(appOrigin: string, raw: string): boolean {
  try {
    return new URL(raw).origin === appOrigin;
  } catch {
    return false;
  }
}

const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

/** A link the OS browser may open; file:, javascript: and custom schemes are refused. */
export function parseExternalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return EXTERNAL_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
