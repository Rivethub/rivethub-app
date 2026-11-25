import type { Hub } from "@rivethub/contracts";

export interface HubSummary {
  name: string;
  meta: string;
  online: boolean;
}

/** What the hub switcher shows for the hub this app is reading. */
export function currentHubSummary(hubs: Hub[] | undefined, harnessCount: number | undefined, spaces?: readonly string[]): HubSummary {
  const current = hubs?.find((h) => h.current);
  if (!current) return { name: "No hub", meta: "Not connected", online: false };
  const tools = harnessCount !== undefined ? `${harnessCount} ${harnessCount === 1 ? "tool" : "tools"}` : "";
  const meta = current.kind === "local" ? [spaces?.filter(Boolean).join(", "), "Local hub", tools].filter(Boolean).join(" · ") : current.detail;
  return { name: current.name, meta, online: current.online };
}

/** A hub can be switched to when it is another hub, it answers, and it uses an http/https URL. */
export function canSwitchTo(hub: Hub): boolean {
  if (hub.current || !hub.online || hub.url === "#") return false;
  try {
    const parsed = new URL(hub.url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
