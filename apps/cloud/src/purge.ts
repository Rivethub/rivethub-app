import type { Store } from "./store/types.js";

const DAY_MS = 86_400_000;

export async function purge(store: Store, now: Date, retentionDays: number): Promise<void> {
  await store.purgeExpired(now);
  await store.purgeTelemetry(new Date(now.getTime() - retentionDays * DAY_MS));
}
