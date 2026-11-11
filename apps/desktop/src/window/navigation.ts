/** An http(s) URL on the node's origin. A same-origin blob: or about: URL is not the node. */
export function isNodeUrl(appOrigin: string, raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === appOrigin;
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

/** How long a click or key press lets the page hand one link to the OS browser. */
export const ACTIVATION_MS = 1000;

const ACTIVATING_INPUTS = new Set(["mouseDown", "mouseUp", "rawKeyDown", "keyDown", "touchEnd", "gestureTap"]);

/**
 * Tracks user input main sees, so a link goes to the OS browser only right
 * after a click or key press. A redirect, meta refresh or script has no input
 * behind it. Each input lets one link out.
 */
export function createUserActivation(now: () => number = Date.now) {
  let activatedAt = -Infinity;
  return {
    note(inputType: string): void {
      if (ACTIVATING_INPUTS.has(inputType)) activatedAt = now();
    },
    consume(): boolean {
      const active = now() - activatedAt < ACTIVATION_MS;
      activatedAt = -Infinity;
      return active;
    },
  };
}
