import type { HarnessStatus } from "@rivethub/contracts";

/**
 * rh can edit a missing capture hook or a missing recall entry. A tool that is only quiet is already wired.
 * rh installs capture only as a hook or a plug-in; a tool it reads from a store, or that pushes its own
 * sessions, has no capture to install, so the only thing to connect there is recall.
 */
export function harnessAction(h: HarnessStatus): { label: string; part: "capture" | "recall" } | null {
  if (!h.canConnect) return null;
  const installs = h.capture.method === "hook" || h.capture.method === "plugin";
  if (installs && h.capture.state === "not-connected") return { label: "Connect", part: "capture" };
  if (h.recall.state === "not-connected") return { label: "Connect recall", part: "recall" };
  return null;
}
