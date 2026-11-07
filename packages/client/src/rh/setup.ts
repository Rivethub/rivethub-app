import type { HarnessId, HarnessStatus, ModelJob } from "@rivethub/contracts";
import type { Http } from "../http.js";
import * as wire from "./wire.js";
import { strip } from "./util.js";

export function setupApi(http: Http) {
  return {
    async harnesses(): Promise<HarnessStatus[]> {
      const list = await http.get("/api/capture/status", wire.harnessStatusList);
      return list.map((h) =>
        strip<HarnessStatus>({
          id: h.id,
          name: h.name,
          found: h.found,
          path: h.path,
          version: h.version,
          capture: strip({ method: h.capture.method, state: h.capture.state, lastCaptureAt: h.capture.lastCaptureAt, detail: h.capture.detail }),
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
