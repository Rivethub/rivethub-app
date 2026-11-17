import type { HarnessStatus } from "@rivethub/contracts";

/** rh can edit a missing capture hook or a missing recall entry. A tool that is only quiet is already wired. */
export function harnessAction(h: HarnessStatus): { label: string; part: "capture" | "recall" } | null {
  if (!h.canConnect) return null;
  if (h.capture.state === "not-connected") return { label: "Connect", part: "capture" };
  if (h.recall.state === "not-connected") return { label: "Connect recall", part: "recall" };
  return null;
}
