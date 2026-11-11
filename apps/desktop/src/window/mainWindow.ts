import { BrowserWindow, screen, shell } from "electron";

import { DEFAULT_SIZE, MIN_SIZE, readWindowState, restorableBounds, writeWindowState } from "../settings/windowState";
import { isSameOrigin, parseExternalUrl } from "./navigation";

export interface MainWindowOptions {
  preloadPath: string;
  /** rh's origin; the window never leaves it. */
  origin: string;
  windowStateFile: string;
}

export function createMainWindow({ preloadPath, origin, windowStateFile }: MainWindowOptions): BrowserWindow {
  const saved = readWindowState(windowStateFile);
  const bounds = restorableBounds(saved, screen.getAllDisplays().map((d) => d.workArea));
  const window = new BrowserWindow({
    ...(bounds ?? DEFAULT_SIZE),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    autoHideMenuBar: true,
    title: "RivetHub",
    backgroundColor: "#2d353b",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  if (bounds && saved?.maximized) window.maximize();
  window.once("ready-to-show", () => window.show());

  const openOutside = (url: string) => {
    const external = parseExternalUrl(url);
    if (external !== null) void shell.openExternal(external);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  const pin = (event: Electron.Event, url: string) => {
    if (isSameOrigin(origin, url)) return;
    event.preventDefault();
    openOutside(url);
  };
  window.webContents.on("will-navigate", pin);
  window.webContents.on("will-redirect", pin);

  const save = () => {
    if (window.isDestroyed()) return;
    writeWindowState(windowStateFile, { bounds: window.getNormalBounds(), maximized: window.isMaximized() });
  };
  window.on("close", save);
  return window;
}
