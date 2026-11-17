import type { ModelJob } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";

function renderStats(jobs: ModelJob[]) {
  const base = createSampleClient();
  const client = { ...base, modelJobs: async () => jobs } as AppClient;
  render(<App client={client} history={createMemoryHistory({ initialEntries: ["/stats"] })} />);
}

function job(partial: Partial<ModelJob> & Pick<ModelJob, "role">): ModelJob {
  return { inheritsDefault: false, health: "healthy", detail: "", queued: 0, ...partial };
}

describe("Stats workers", () => {
  it("shows the model, the state, the queue and the outage for each worker", async () => {
    renderStats([
      job({ role: "summarizer", provider: "gpubox", model: "thinkingcap-flash-next" }),
      job({ role: "categorizer", provider: "gpubox", model: "thinkingcap-flash-next", health: "failing", queued: 1628, outage: "the worker stopped claiming" }),
      job({ role: "wiki-writer", health: "not-running", queued: 27 }),
      job({ role: "embedder", provider: "http://10.4.20.12:9402", model: "nemotron-embed-8b" }),
    ]);
    const workers = await screen.findByRole("region", { name: /Workers/ });
    const tile = (name: string) => within(workers).getByText(name).parentElement!;
    expect(tile("Summarizer")).toHaveTextContent("gpubox · thinkingcap-flash-next");
    expect(tile("Summarizer")).toHaveTextContent("Running · 0 waiting");
    expect(tile("Categorizer")).toHaveTextContent("Failing · 1,628 waiting · the worker stopped claiming");
    expect(tile("Wiki builder")).toHaveTextContent("No model set");
    expect(tile("Wiki builder")).toHaveTextContent("Not running · 27 waiting");
    expect(tile("Embedder")).toHaveTextContent("http://10.4.20.12:9402 · nemotron-embed-8b");
    expect(workers).not.toHaveTextContent(/Default ·/);
    expect(workers).not.toHaveTextContent("opus");
  });
});
