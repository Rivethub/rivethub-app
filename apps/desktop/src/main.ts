import path from "node:path";
import { app, BrowserWindow, session } from "electron";

import { UPDATE_STATE_CHANNEL } from "./ipc/channels";
import { registerIpcHandlers } from "./ipc/handlers";
import { bundledResources } from "./bundle/layout";
import { mintLoginCode, signedInUrl } from "./node/login";
import { parseNodeUrl } from "./node/nodeUrl";
import { createDesktopUpdates } from "./updates/desktopUpdates";
import { createMainWindow, unreachablePage } from "./window/mainWindow";
import { isNodeUrl } from "./window/navigation";

/** The renderer gets one permission: writing to the clipboard (apps/web's copy buttons). Reading it stays denied. */
const allowPermission = (permission: string) => permission === "clipboard-sanitized-write";

function readNodeUrl(): URL | null {
  try {
    return parseNodeUrl(process.env["RIVETHUB_DESKTOP_URL"]);
  } catch (error) {
    console.error(`RivetHub: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function run(nodeUrl: URL): void {
  const origin = nodeUrl.origin;
  let mainWindow: BrowserWindow | null = null;
  const rh = process.env["RIVETHUB_RH"] ?? (app.isPackaged ? bundledResources(process.resourcesPath).rh : "rh");
  const mintCode = () => mintLoginCode(origin, { rh });

  const openSignedIn = async (window: BrowserWindow) => {
    try {
      await window.loadURL(signedInUrl(nodeUrl, await mintCode()));
    } catch (error) {
      if (window.isDestroyed()) return;
      console.error(`RivetHub: can't load ${origin}:`, error);
      // A newer load or a blocked redirect left the window on a node page; keep it.
      if (isNodeUrl(origin, window.webContents.getURL()) && (error as { code?: unknown }).code === "ERR_ABORTED") return;
      await window.loadURL(unreachablePage(origin)).catch(() => {});
    }
  };

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });

  app.on("window-all-closed", () => app.quit());

  void app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowPermission(permission)));
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowPermission(permission));
    const updates = createDesktopUpdates({
      settingsFile: path.join(app.getPath("userData"), "update-settings.json"),
      window: () => mainWindow,
      onState: (state) => mainWindow?.webContents.send(UPDATE_STATE_CHANNEL, state),
    });
    registerIpcHandlers(origin, mintCode, updates);
    mainWindow = createMainWindow({
      preloadPath: path.join(__dirname, "preload.cjs"),
      origin,
      windowStateFile: path.join(app.getPath("userData"), "window-state.json"),
      onLeftNode: (window) => void openSignedIn(window),
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    await openSignedIn(mainWindow);
    updates.start();
  });
}

const nodeUrl = readNodeUrl();
if (nodeUrl === null) {
  app.exit(1);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  run(nodeUrl);
}
