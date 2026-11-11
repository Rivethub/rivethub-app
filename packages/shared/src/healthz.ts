import { z } from "zod";

/** The body every rh gateway answers on `/healthz`, healthy (200) or degraded (503). */
const HealthzBody = z.object({
  ok: z.boolean(),
  sessions: z.number().int().nonnegative(),
  name: z.string().min(1),
  node: z.string().min(1),
  version: z.string().optional(),
  degraded: z.string().optional(),
});

export type HealthzProbe =
  | { kind: "rivethub"; ok: boolean; name: string; node: string; version: string | null; degraded: string | null }
  | { kind: "foreign"; status: number }
  | { kind: "unreachable"; reason: string };

/**
 * Asks `baseUrl` whether it is a RivetHub node. Any HTTP answer whose body is
 * not the rh health shape is `foreign`, so another server on the port is never
 * mistaken for a running node. Only a 200 (healthy) or 503 (degraded) carrying
 * the full rh body counts; redirects and other statuses are `foreign`.
 */
export async function probeHealthz(baseUrl: string, timeoutMs = 2500): Promise<HealthzProbe> {
  let response: Response;
  try {
    response = await fetch(new URL("/healthz", baseUrl), { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
  } catch (error) {
    return { kind: "unreachable", reason: error instanceof Error ? error.message : String(error) };
  }
  if (response.status !== 200 && response.status !== 503) return { kind: "foreign", status: response.status };
  const body = HealthzBody.safeParse(await response.json().catch(() => null));
  if (!body.success) return { kind: "foreign", status: response.status };
  const { ok, name, node, version, degraded } = body.data;
  return { kind: "rivethub", ok, name, node, version: version ?? null, degraded: degraded ?? null };
}
