import path from "node:path";
import { app, BrowserWindow, session } from "electron";

import { registerIpcHandlers } from "./ipc/handlers";
import { mintLoginCode, signedInUrl } from "./node/login";
import { parseNodeUrl } from "./node/nodeUrl";
import { createMainWindow } from "./window/mainWindow";

const nodeUrl = parseNodeUrl(process.env["RIVETHUB_DESKTOP_URL"]);
const origin = nodeUrl.origin;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  const openSignedIn = async (window: BrowserWindow) => {
    await window.loadURL(signedInUrl(nodeUrl, await mintLoginCode(origin)));
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
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerIpcHandlers(origin, openSignedIn);
    mainWindow = createMainWindow({
      preloadPath: path.join(__dirname, "preload.cjs"),
      origin,
      windowStateFile: path.join(app.getPath("userData"), "window-state.json"),
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    await openSignedIn(mainWindow);
  });
}
