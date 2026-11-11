import type { RivetHubDesktop } from "@rivethub/contracts";
import { contextBridge, ipcRenderer } from "electron";

import { RELOGIN_CHANNEL } from "./ipc/channels";

const desktop: RivetHubDesktop = {
  relogin: async () => {
    await ipcRenderer.invoke(RELOGIN_CHANNEL);
  },
};

contextBridge.exposeInMainWorld("rivethub", desktop);
