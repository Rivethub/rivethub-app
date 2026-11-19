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

/** A captured session the host should open as a thread. */
export interface HostOpenSessionRequest {
  /** Memory's id for the session. */
  sessionId: string;
  /** HarnessId. */
  harness: string;
  title: string;
  /** ISO time. */
  startedAt: string;
  cwd?: string;
  /** The tool's own id for the session, when the hub sends it. */
  nativeSessionId?: string;
  resumeCommand?: string;
  /** The existing handoffPrompt() text. */
  handoffPrompt: string;
}

export type HostOpenSessionResult =
  | { opened: true; how: "resumed" | "handoff" }
  | { opened: false; reason: string };

/**
 * Present when the web app runs inside another app's window.
 * The host sets this on `window.rivethub`. The web app checks the shape once, at that boundary.
 */
export interface RivetHubHost {
  /** Shown to the person, as in "Open in T3.1 Code". */
  name: string;
  appearance?: {
    get: () => "light" | "dark";
    /** Calls listener on every change; returns the unsubscribe. */
    onChange: (listener: (appearance: "light" | "dark") => void) => () => void;
  };
  /** Opens a captured session as a thread in the host. Never rejects. */
  openSession?: (request: HostOpenSessionRequest) => Promise<HostOpenSessionResult>;
}

/**
 * What the Electron preload exposes as `window.rivethub`, and nothing more.
 * The renderer is apps/web on rh's own origin with a browser session; main
 * holds the owner token and only ever hands the window a fresh login.
 * A host that only embeds the web app leaves `updates` off and sets `host`.
 */
export interface RivetHubDesktop {
  /**
   * Main mints a one-time login code with the owner token, which never leaves main, and returns the code, or
   * null when it can't. The renderer exchanges the code at `POST /api/auth/session` for a fresh session in
   * place, so the screen it is on keeps its state.
   */
  relogin: () => Promise<string | null>;
  /** Absent when the host does not own RivetHub's updates (a host that only embeds the web app). */
  updates?: {
    getState: () => Promise<DesktopUpdateState>;
    /** Calls `listener` on every change; returns the unsubscribe. */
    onState: (listener: (state: DesktopUpdateState) => void) => () => void;
    /** Persists the channel and checks it now. Stable is the default; nightly is opt-in. */
    setChannel: (channel: DesktopUpdateChannel) => Promise<DesktopUpdateState>;
    /** Quits and installs a `ready` update; rejects in any other state. */
    restartToUpdate: () => Promise<void>;
  };
  /** Present when the web app runs inside another app's window. */
  host?: RivetHubHost;
}
