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

/**
 * The app's own updates, from static files at get.rivethub.io/desktop/<channel>/.
 * `manual`: a .deb install can't replace itself, so the user downloads the new package.
 * `disabled`: a dev build, or an install that isn't the AppImage or the .deb.
 */
export type DesktopUpdateState =
  | { state: "disabled"; channel: DesktopUpdateChannel; reason: string }
  | { state: "idle"; channel: DesktopUpdateChannel; checkedAt: IsoTime | null }
  | { state: "checking"; channel: DesktopUpdateChannel }
  | { state: "downloading"; channel: DesktopUpdateChannel; version: string; percent: number }
  | { state: "ready"; channel: DesktopUpdateChannel; version: string }
  | { state: "manual"; channel: DesktopUpdateChannel; version: string; downloadUrl: string }
  | { state: "error"; channel: DesktopUpdateChannel; message: string };

/**
 * What the Electron preload exposes as `window.rivethub`, and nothing more.
 * The renderer is apps/web on rh's own origin with a browser session; main
 * holds the owner token and only ever hands the window a fresh login.
 */
export interface RivetHubDesktop {
  /** Main mints a new login code with the owner token and reloads the window through `/login`. */
  relogin: () => Promise<void>;
  updates: {
    getState: () => Promise<DesktopUpdateState>;
    /** Calls `listener` on every change; returns the unsubscribe. */
    onState: (listener: (state: DesktopUpdateState) => void) => () => void;
    /** Persists the channel and checks it now. Stable is the default; nightly is opt-in. */
    setChannel: (channel: DesktopUpdateChannel) => Promise<DesktopUpdateState>;
    /** Quits and installs a `ready` update; rejects in any other state. */
    restartToUpdate: () => Promise<void>;
  };
}
