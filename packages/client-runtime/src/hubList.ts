import type { Hub } from "@rivethub/contracts";

export interface HubSummary {
  name: string;
  meta: string;
  online: boolean;
}

/** What the hub switcher shows for the hub this app is reading. */
export function currentHubSummary(hubs: Hub[] | undefined, harnessCount: number | undefined): HubSummary {
  const current = hubs?.find((h) => h.current);
  if (!current) return { name: "No hub", meta: "Not connected", online: false };
  const meta = current.kind === "local" ? `Local hub${harnessCount !== undefined ? ` · ${harnessCount} ${harnessCount === 1 ? "tool" : "tools"} sending` : ""}` : current.detail;
  return { name: current.name, meta, online: current.online };
}

/** A hub can be switched to when it is another hub, it answers, and it has a real address. */
export function canSwitchTo(hub: Hub): boolean {
  return !hub.current && hub.online && hub.url !== "#";
}
