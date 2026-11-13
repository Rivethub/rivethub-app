import type { RivetHubDesktop } from "@rivethub/contracts";

/**
 * The Electron preload's bridge, or null in a browser. Sharing runs only where
 * the person's own rh and their sign-in are on this machine, so the Share and
 * Receive screens exist only when this is present.
 */
export function desktopBridge(): RivetHubDesktop | null {
  return (window as { rivethub?: RivetHubDesktop }).rivethub ?? null;
}
