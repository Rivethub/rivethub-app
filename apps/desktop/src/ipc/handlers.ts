import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";

import { isUpdateChannel } from "../settings/updateChannel";
import type { DesktopUpdates } from "../updates/desktopUpdates";
import { isNodeUrl } from "../window/navigation";
import { RELOGIN_CHANNEL, UPDATE_GET_STATE_CHANNEL, UPDATE_RESTART_CHANNEL, UPDATE_SET_CHANNEL_CHANNEL } from "./channels";

/** The renderer's IPC. Only a top-level frame on rh's origin may call it. */
export function registerIpcHandlers(origin: string, openSignedIn: (window: BrowserWindow) => Promise<void>, updates: DesktopUpdates): void {
  const callerWindow = (event: IpcMainInvokeEvent): BrowserWindow => {
    const frame = event.senderFrame;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!frame || frame.parent !== null || !isNodeUrl(origin, frame.url) || !window) {
      throw new Error("refused: caller is not the RivetHub window");
    }
    return window;
  };

  ipcMain.handle(RELOGIN_CHANNEL, async (event) => openSignedIn(callerWindow(event)));
  ipcMain.handle(UPDATE_GET_STATE_CHANNEL, (event) => {
    callerWindow(event);
    return updates.getState();
  });
  ipcMain.handle(UPDATE_SET_CHANNEL_CHANNEL, (event, channel: unknown) => {
    callerWindow(event);
    if (!isUpdateChannel(channel)) throw new Error("The update channel must be stable or nightly.");
    return updates.setChannel(channel);
  });
  ipcMain.handle(UPDATE_RESTART_CHANNEL, (event) => {
    callerWindow(event);
    updates.restartToUpdate();
  });
}
