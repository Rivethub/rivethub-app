import type { IsoTime } from "./domain.js";

/** The local rh node as the desktop app last saw it. */
export type NodeStatus =
  | { state: "checking" }
  | { state: "running"; baseUrl: string; node: string; version: string | null; checkedAt: IsoTime }
  | { state: "degraded"; baseUrl: string; node: string; version: string | null; reason: string; checkedAt: IsoTime }
  | { state: "unreachable"; baseUrl: string; reason: string; checkedAt: IsoTime }
  | { state: "port-conflict"; baseUrl: string; port: number; checkedAt: IsoTime }
  | { state: "restarting"; baseUrl: string; attempt: number; reason: string };

/** The first-run step the window shows; `done` once the node runs and setup has been seen. */
export type SetupState =
  | { step: "port-conflict"; port: number; freePort: number }
  | { step: "service"; installed: boolean }
  | { step: "connect-tools" }
  | { step: "done" };

export type DesktopUpdateChannel = "stable" | "nightly";

export type DesktopUpdateState =
  | { state: "idle"; channel: DesktopUpdateChannel; checkedAt: IsoTime | null }
  | { state: "checking"; channel: DesktopUpdateChannel }
  | { state: "available"; channel: DesktopUpdateChannel; version: string }
  | { state: "downloading"; channel: DesktopUpdateChannel; version: string; percent: number }
  | { state: "ready"; channel: DesktopUpdateChannel; version: string }
  | { state: "error"; channel: DesktopUpdateChannel; message: string };

/**
 * What the Electron preload exposes as `window.rivethub`, and nothing more.
 * The renderer is apps/web on rh's own origin with a browser session; main
 * holds the owner token and only ever hands the window a fresh login.
 */
export interface RivetHubDesktop {
  /** Main mints a new login code with the owner token and reloads the window through `/login`. */
  relogin: () => Promise<void>;
}
