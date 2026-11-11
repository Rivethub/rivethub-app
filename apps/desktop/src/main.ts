import path from "node:path";
import { app, BrowserWindow, session } from "electron";

import { registerIpcHandlers } from "./ipc/handlers";
import { mintLoginCode, signedInUrl } from "./node/login";
import { parseNodeUrl } from "./node/nodeUrl";
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

  const openSignedIn = async (window: BrowserWindow) => {
    try {
      await window.loadURL(signedInUrl(nodeUrl, await mintLoginCode(origin)));
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
    registerIpcHandlers(origin, openSignedIn);
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
