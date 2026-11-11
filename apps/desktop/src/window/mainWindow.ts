import { BrowserWindow, screen, shell } from "electron";

import { DEFAULT_SIZE, MIN_SIZE, readWindowState, restorableBounds, writeWindowState } from "../settings/windowState";
import { createUserActivation, isNodeUrl, parseExternalUrl } from "./navigation";

export interface MainWindowOptions {
  preloadPath: string;
  /** rh's origin; the window never leaves it. */
  origin: string;
  windowStateFile: string;
  /** Called when the top frame commits a page off the node (about:blank, say); main reopens the node. */
  onLeftNode: (window: BrowserWindow) => void;
}

export function createMainWindow({ preloadPath, origin, windowStateFile, onLeftNode }: MainWindowOptions): BrowserWindow {
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

  // Only a link the user just clicked goes to the OS browser. Redirects, meta
  // refreshes and scripted navigations off the node are dropped.
  const activation = createUserActivation();
  window.webContents.on("input-event", (_event, input) => activation.note(input.type));
  const openIfClicked = (url: string) => {
    const external = parseExternalUrl(url);
    if (external !== null && activation.consume()) void shell.openExternal(external);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openIfClicked(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isNodeUrl(origin, url)) return;
    event.preventDefault();
    openIfClicked(url);
  });
  window.webContents.on("will-redirect", (event, url) => {
    if (!isNodeUrl(origin, url)) event.preventDefault();
  });
  // about:blank and the like commit without will-navigate.
  window.webContents.on("did-navigate", (_event, url) => {
    if (!isNodeUrl(origin, url) && url !== unreachablePage(origin)) onLeftNode(window);
  });

  const save = () => {
    if (window.isDestroyed()) return;
    writeWindowState(windowStateFile, { bounds: window.getNormalBounds(), maximized: window.isMaximized() });
  };
  window.on("close", save);
  return window;
}

/** The page main shows when the node can't be loaded. Static, no script; the only non-node page the window keeps. */
export function unreachablePage(origin: string): string {
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>RivetHub</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#2d353b;color:#d3c6aa;font:15px system-ui,sans-serif">
<main><h1 style="font-size:20px">Can't reach your RivetHub node</h1><p>RivetHub couldn't open ${escapeHtml(origin)}. Check that <code>rh local</code> is running, then reopen RivetHub.</p></main>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
