import { readFileSync } from "node:fs";
import path from "node:path";
import type { DesktopUpdateChannel, DesktopUpdateState, IsoTime } from "@rivethub/contracts";
import { app, dialog, session, shell, type BrowserWindow, type MessageBoxOptions } from "electron";
import { AppImageUpdater, DebUpdater, type AppUpdater } from "electron-updater";

import { readUpdateChannel, writeUpdateChannel } from "../settings/updateChannel";
import { channelFeedUrl, debDownloadUrl, detectInstall, UPDATE_FEED_BASE, type UpdateInstall } from "./updateFeed";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** electron-updater makes all its requests on this session (its NET_SESSION_NAME). */
const UPDATER_PARTITION = "electron-updater";

export interface DesktopUpdates {
  getState: () => DesktopUpdateState;
  setChannel: (channel: DesktopUpdateChannel) => DesktopUpdateState;
  restartToUpdate: () => void;
  /** Checks now, then every six hours. */
  start: () => void;
}

interface UpdateSource {
  install: UpdateInstall;
  feedBase: string;
  /** Lets electron-updater run unpackaged: only when a dev run named its own feed. */
  forceDevUpdateConfig: boolean;
}

/**
 * A packaged app always uses get.rivethub.io. An unpackaged run (the e2e tests) may name its
 * own feed and package type; a packaged one ignores both, so the environment can't redirect it.
 */
function updateSource(): UpdateSource {
  const devFeed = app.isPackaged ? undefined : process.env["RIVETHUB_DESKTOP_UPDATE_FEED"];
  const packageType = app.isPackaged ? readPackageType() : (process.env["RIVETHUB_DESKTOP_PACKAGE_TYPE"] ?? null);
  return {
    install: detectInstall({ updatable: app.isPackaged || devFeed !== undefined, appImage: process.env["APPIMAGE"], packageType }),
    feedBase: devFeed ?? UPDATE_FEED_BASE,
    forceDevUpdateConfig: devFeed !== undefined,
  };
}

function readPackageType(): string | null {
  try {
    return readFileSync(path.join(process.resourcesPath, "package-type"), "utf8");
  } catch {
    return null;
  }
}

function createUpdater(install: Exclude<UpdateInstall, { kind: "unsupported" }>, forceDevUpdateConfig: boolean): AppUpdater {
  const updater = install.kind === "appimage" ? new AppImageUpdater() : new DebUpdater();
  updater.forceDevUpdateConfig = forceDevUpdateConfig;
  // check() downloads, and only for an AppImage: a .deb only learns the version.
  updater.autoDownload = false;
  // Nothing installs until the user says restart.
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  // electron-updater verifies each download's sha512 against the feed; this keeps every request,
  // redirects included, on https.
  session.fromPartition(UPDATER_PARTITION, { cache: false }).webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith("https://") });
  });
  // Each failure also rejects the call that hit it; without a listener EventEmitter would throw.
  updater.on("error", () => {});
  return updater;
}

const now = () => new Date().toISOString() as IsoTime;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createDesktopUpdates(options: {
  settingsFile: string;
  /** The window prompts attach to; null when it's closed. */
  window: () => BrowserWindow | null;
  onState: (state: DesktopUpdateState) => void;
}): DesktopUpdates {
  const { install, feedBase, forceDevUpdateConfig } = updateSource();
  let channel = readUpdateChannel(options.settingsFile);
  let state: DesktopUpdateState =
    install.kind === "unsupported" ? { state: "disabled", channel, reason: install.reason } : { state: "idle", channel, checkedAt: null };
  const setState = (next: DesktopUpdateState) => {
    state = next;
    options.onState(next);
  };
  const updater = install.kind === "unsupported" ? null : createUpdater(install, forceDevUpdateConfig);
  const prompted = new Set<string>();

  const ask = async (key: string, box: MessageBoxOptions): Promise<boolean> => {
    if (prompted.has(key)) return false;
    prompted.add(key);
    const window = options.window();
    const { response } = await (window ? dialog.showMessageBox(window, box) : dialog.showMessageBox(box));
    return response === 0;
  };

  const restartToUpdate = () => {
    if (updater === null || state.state !== "ready") throw new Error("No update is ready to install.");
    // The new copy starts before this one exits; it must be able to take the single-instance lock.
    app.releaseSingleInstanceLock();
    updater.quitAndInstall();
  };

  let checking = false;
  let recheck = false;

  /** One check at a time. A check asked for meanwhile (a channel change, say) runs next, and the stale result is dropped. */
  const check = async () => {
    if (updater === null) return;
    if (checking) {
      recheck = true;
      return;
    }
    checking = true;
    try {
      do {
        recheck = false;
        await checkOnce(updater);
      } while (recheck);
    } finally {
      checking = false;
    }
  };

  const checkOnce = async (updater: AppUpdater) => {
    if (state.state === "ready") return;
    const checked = channel;
    const stale = () => recheck || channel !== checked;
    try {
      const feedUrl = channelFeedUrl(feedBase, checked);
      setState({ state: "checking", channel: checked });
      updater.setFeedURL({ provider: "generic", url: feedUrl });
      const result = await updater.checkForUpdates();
      if (stale()) return;
      if (!result?.isUpdateAvailable) {
        setState({ state: "idle", channel: checked, checkedAt: now() });
        return;
      }
      const { version, files } = result.updateInfo;
      if (install.kind === "deb") {
        const downloadUrl = debDownloadUrl(feedUrl, files);
        setState({ state: "manual", channel: checked, version, downloadUrl });
        void ask(`manual:${version}`, {
          type: "info",
          buttons: ["Download", "Later"],
          defaultId: 0,
          cancelId: 1,
          message: `RivetHub ${version} is available`,
          detail: "This copy was installed from the .deb, so it can't update itself. Download the new package and install it.",
        }).then((download) => {
          if (download) void shell.openExternal(downloadUrl);
        });
        return;
      }
      setState({ state: "downloading", channel: checked, version, percent: 0 });
      // Rejects unless the file's sha512 matches the feed's.
      await updater.downloadUpdate();
      setState({ state: "ready", channel: checked, version });
      void ask(`ready:${version}`, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        message: `RivetHub ${version} is ready`,
        detail: "Restart RivetHub to finish updating.",
      }).then((restart) => {
        if (restart && state.state === "ready" && state.version === version) restartToUpdate();
      });
    } catch (error) {
      if (!stale()) setState({ state: "error", channel: checked, message: errorMessage(error) });
    }
  };

  updater?.on("download-progress", (progress) => {
    if (state.state === "downloading") setState({ ...state, percent: Math.floor(progress.percent) });
  });

  return {
    getState: () => state,
    setChannel: (next) => {
      if (state.state === "downloading") throw new Error("Wait for the download to finish before changing channels.");
      writeUpdateChannel(options.settingsFile, next);
      channel = next;
      setState(state.state === "disabled" ? { ...state, channel } : { state: "idle", channel, checkedAt: null });
      void check();
      return state;
    },
    restartToUpdate,
    start: () => {
      void check();
      setInterval(() => void check(), CHECK_INTERVAL_MS);
    },
  };
}
