import type { DesktopUpdateState, RivetHubDesktop } from "@rivethub/contracts";
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { RELOGIN_CHANNEL, UPDATE_GET_STATE_CHANNEL, UPDATE_RESTART_CHANNEL, UPDATE_SET_CHANNEL_CHANNEL, UPDATE_STATE_CHANNEL } from "./ipc/channels";

const desktop: RivetHubDesktop = {
  relogin: async () => {
    await ipcRenderer.invoke(RELOGIN_CHANNEL);
  },
  updates: {
    getState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
    onState: (listener) => {
      const forward = (_event: IpcRendererEvent, state: DesktopUpdateState) => listener(state);
      ipcRenderer.on(UPDATE_STATE_CHANNEL, forward);
      return () => ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, forward);
    },
    setChannel: (channel) => ipcRenderer.invoke(UPDATE_SET_CHANNEL_CHANNEL, channel),
    restartToUpdate: async () => {
      await ipcRenderer.invoke(UPDATE_RESTART_CHANNEL);
    },
  },
};

contextBridge.exposeInMainWorld("rivethub", desktop);
