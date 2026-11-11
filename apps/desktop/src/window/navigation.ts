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

/** How long a click, Enter or Space lets the page hand one link to the OS browser. */
export const ACTIVATION_MS = 1000;

const ACTIVATING_POINTER = new Set(["mouseDown", "touchEnd", "gestureTap"]);
const ACTIVATING_KEYS = new Set(["Enter", " "]);

/**
 * Tracks user input main sees, so a link goes to the OS browser only right
 * after a click or key press. A redirect, meta refresh or script has no input
 * behind it. Each input lets one link out.
 */
export function createUserActivation(now: () => number = Date.now) {
  let activatedAt = -Infinity;
  return {
    /** A pointer event main saw (`input-event`): a press or tap activates; moves and scrolls don't. */
    notePointer(inputType: string): void {
      if (ACTIVATING_POINTER.has(inputType)) activatedAt = now();
    },
    /** A key main saw (`before-input-event`): only Enter or Space, the keys that follow a focused link, activate. */
    noteKey(inputType: string, key: string): void {
      if (inputType === "keyDown" && ACTIVATING_KEYS.has(key)) activatedAt = now();
    },
    /** Forget any pending activation, so a new page can't spend input given to the old one. */
    reset(): void {
      activatedAt = -Infinity;
    },
    consume(): boolean {
      const active = now() - activatedAt < ACTIVATION_MS;
      activatedAt = -Infinity;
      return active;
    },
  };
}
