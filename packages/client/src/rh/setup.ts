import type { HarnessId, HarnessStatus, ModelJob } from "@rivethub/contracts";
import { RouteMissingError } from "../errors.js";
import type { Http } from "../http.js";
import * as wire from "./wire.js";
import { strip } from "./util.js";

/**
 * rh calls a tool `stale` both when it stopped sending sessions and when it is set up and has sent none yet.
 * Only the first is a problem, and only the first has a last capture time.
 */
function captureState(state: string, lastCaptureAt: string | undefined): HarnessStatus["capture"]["state"] {
  return state === "stale" && lastCaptureAt === undefined ? "idle" : state;
}

export function setupApi(http: Http) {
  return {
    async harnesses(): Promise<HarnessStatus[]> {
      const [list, tools] = await Promise.all([http.get("/api/capture/status", wire.harnessStatusList), http.get("/api/harnesses", wire.harnessList).catch((error: unknown) => { if (error instanceof RouteMissingError) return { harnesses: [] }; throw error; })]);
      return list.map((h) =>
        strip<HarnessStatus>({
          id: h.id,
          capabilities: { renameSession: tools.harnesses.find((tool) => tool.harnessId === h.id)?.capabilities.renameSession ?? false },
          name: h.name,
          found: h.found,
          path: h.path,
          version: h.version,
          capture: strip({ method: h.capture.method, state: captureState(h.capture.state, h.capture.lastCaptureAt), lastCaptureAt: h.capture.lastCaptureAt, detail: h.capture.detail }),
          recall: h.recall,
          canConnect: h.canConnect,
        }),
      );
    },

    connectHarness: (id: HarnessId, part: "capture" | "recall", options?: { dryRun?: boolean }) =>
      http.sendFor("POST", `/api/harnesses/${encodeURIComponent(id)}/connect`, wire.connectOutcome, { part, dryRun: options?.dryRun ?? false }),

    async modelJobs(): Promise<ModelJob[]> {
      const jobs = await http.get("/api/memory/models", wire.modelJobList);
      return jobs.map((job) => strip<ModelJob>(job));
    },
  };
}
