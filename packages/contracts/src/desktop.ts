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
 * What the Electron preload exposes as `window.desktopBridge`. The web build
 * checks for it and falls back to browser behaviour when it is absent.
 */
export interface DesktopBridge {
  getNode: () => Promise<NodeStatus>;
  onNodeStatus: (listener: (status: NodeStatus) => void) => () => void;
  restartNode: () => Promise<void>;
  getSetupState: () => Promise<SetupState>;
  openExternal: (url: string) => Promise<boolean>;
  getUpdateState: () => Promise<DesktopUpdateState>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
  checkForUpdate: () => Promise<DesktopUpdateState>;
  installUpdate: () => Promise<void>;
}
