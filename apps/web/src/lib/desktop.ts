import type { HostOpenSessionRequest, HostOpenSessionResult, RivetHubDesktop, RivetHubHost } from "@rivethub/contracts";

const OPEN_FAILED = "The host could not open this session.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readUpdates(value: unknown): NonNullable<RivetHubDesktop["updates"]> | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.getState !== "function" || typeof value.onState !== "function" || typeof value.setChannel !== "function" || typeof value.restartToUpdate !== "function") return undefined;
  return value as NonNullable<RivetHubDesktop["updates"]>;
}

function readAppearance(value: unknown): NonNullable<RivetHubHost["appearance"]> | undefined {
  if (!isRecord(value) || typeof value.get !== "function" || typeof value.onChange !== "function") return undefined;
  const get = value.get as () => unknown;
  const onChange = value.onChange as (listener: (appearance: "light" | "dark") => void) => unknown;
  let initial: unknown;
  try {
    initial = get();
  } catch {
    return undefined;
  }
  if (initial !== "light" && initial !== "dark") return undefined;
  let last: "light" | "dark" = initial;
  return {
    get: () => {
      try {
        const next = get();
        if (next === "light" || next === "dark") last = next;
      } catch {
        // A later throw keeps the last appearance the host actually reported.
      }
      return last;
    },
    onChange: (listener) => {
      let unsubscribe: unknown;
      try {
        unsubscribe = onChange((next) => {
          if (next === "light" || next === "dark") listener(next);
        });
      } catch {
        return () => {};
      }
      if (typeof unsubscribe !== "function") return () => {};
      return () => {
        try {
          unsubscribe();
        } catch {
          // The host already dropped the listener.
        }
      };
    },
  };
}

function readOpenResult(value: unknown): HostOpenSessionResult | undefined {
  if (!isRecord(value)) return undefined;
  if (value.opened === true && (value.how === "resumed" || value.how === "handoff")) return { opened: true, how: value.how };
  if (value.opened === false && typeof value.reason === "string" && value.reason.trim() !== "") return { opened: false, reason: value.reason };
  return undefined;
}

function wrapOpenSession(open: (request: HostOpenSessionRequest) => Promise<unknown>): NonNullable<RivetHubHost["openSession"]> {
  return async (request) => {
    try {
      return readOpenResult(await open(request)) ?? { opened: false, reason: OPEN_FAILED };
    } catch (error) {
      const reason = error instanceof Error && error.message.trim() !== "" ? error.message : OPEN_FAILED;
      return { opened: false, reason };
    }
  };
}

function readHost(value: unknown): RivetHubHost | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.name !== "string" || value.name.trim() === "") return undefined;
  const host: RivetHubHost = { name: value.name.trim() };
  if ("appearance" in value && value.appearance !== undefined) {
    const appearance = readAppearance(value.appearance);
    if (!appearance) return undefined;
    host.appearance = appearance;
  }
  if ("openSession" in value && value.openSession !== undefined) {
    if (typeof value.openSession !== "function") return undefined;
    host.openSession = wrapOpenSession(value.openSession as (request: HostOpenSessionRequest) => Promise<unknown>);
  }
  return host;
}

/**
 * Checks `window.rivethub` at the boundary. A missing bridge is a normal browser.
 * A bridge whose `host` is the wrong shape is the same bridge with no host, so a bad embed cannot crash the app.
 */
export function readDesktopBridge(value: unknown): RivetHubDesktop | null {
  if (!isRecord(value) || typeof value.relogin !== "function") return null;
  const bridge: RivetHubDesktop = { relogin: value.relogin as RivetHubDesktop["relogin"] };
  const updates = readUpdates(value.updates);
  if (updates) bridge.updates = updates;
  if ("host" in value) {
    const host = readHost(value.host);
    if (host) bridge.host = host;
  }
  return bridge;
}

/**
 * The Electron preload's bridge, or null in a browser. Sharing runs only where
 * the person's own rh and their sign-in are on this machine, so the Share and
 * Receive screens exist only when this is present.
 */
export function desktopBridge(): RivetHubDesktop | null {
  return readDesktopBridge((window as { rivethub?: unknown }).rivethub);
}

/** The host's appearance, when the bridge carries a well-formed one. */
export function hostAppearance(): NonNullable<RivetHubHost["appearance"]> | null {
  return desktopBridge()?.host?.appearance ?? null;
}
