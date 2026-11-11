import { BrowserWindow, ipcMain } from "electron";

import { isSameOrigin } from "../window/navigation";
import { RELOGIN_CHANNEL } from "./channels";

/** The one IPC the renderer has. Only a top-level frame on rh's origin may call it. */
export function registerIpcHandlers(origin: string, openSignedIn: (window: BrowserWindow) => Promise<void>): void {
  ipcMain.handle(RELOGIN_CHANNEL, async (event) => {
    const frame = event.senderFrame;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!frame || frame.parent !== null || !isSameOrigin(origin, frame.url) || !window) {
      throw new Error("relogin refused: caller is not the RivetHub window");
    }
    await openSignedIn(window);
  });
}
