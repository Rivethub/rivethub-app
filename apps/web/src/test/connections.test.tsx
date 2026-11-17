import type { HarnessStatus, IsoTime } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";

function renderWith(path: string, change: (c: AppClient) => Partial<AppClient>) {
  const base = createSampleClient();
  render(<App client={{ ...base, ...change(base) } as AppClient} history={createMemoryHistory({ initialEntries: [path] })} />);
}

const at = (iso: string) => iso as IsoTime;

describe("Connections", () => {
  it("offers a fix only where capture is missing or recall is not connected", async () => {
    renderWith("/settings/connections", (c) => ({
      harnesses: async () => {
        const base = (await c.harnesses())[0]!;
        const row = (id: string, name: string, capture: HarnessStatus["capture"], recall: HarnessStatus["recall"], canConnect: boolean): HarnessStatus => ({
          ...base, id, name, found: true, canConnect, capture, recall,
        });
        return [
          row("dsh", "DeepSeek Harness", { method: "hook", state: "stale", lastCaptureAt: at("2026-11-01T20:00:00Z"), detail: "hook installed" }, { state: "not-connected", detail: "no rh mcp entry" }, true),
          row("hermes", "Hermes", { method: "store-scan", state: "stale", lastCaptureAt: at("2026-10-29T13:50:16Z"), detail: "store" }, { state: "not-connected", detail: "no entry" }, false),
          row("omp", "Oh My Pi", { method: "store-scan", state: "idle", lastCaptureAt: at("2026-11-10T12:00:00Z"), detail: "wired" }, { state: "connected", detail: "yes" }, false),
          row("quiet", "Quiet tool", { method: "hook", state: "idle", detail: "nothing captured yet" }, { state: "connected", detail: "yes" }, true),
          row("kimi", "Kimi Code", { method: "hook", state: "not-connected", detail: "no store" }, { state: "not-connected", detail: "no entry" }, true),
        ];
      },
      modelJobs: async () => [],
    }));

    const deepseek = await screen.findByRole("row", { name: /DeepSeek Harness/ });
    expect(deepseek).toHaveTextContent(/Last captured \d+ days ago/);
    expect(deepseek).not.toHaveTextContent("Stopped");
    expect(screen.getAllByRole("button", { name: "Connect recall DeepSeek Harness" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Fix/ })).not.toBeInTheDocument();

    const hermes = screen.getByRole("row", { name: /Hermes/ });
    expect(hermes).toHaveTextContent(/Last captured \d+ days ago/);
    expect(hermes).not.toHaveTextContent("Stopped");
    expect(screen.queryByRole("button", { name: /Hermes/ })).not.toBeInTheDocument();

    expect(screen.getByRole("row", { name: /Oh My Pi/ })).toHaveTextContent(/Last captured \d+ days ago/);
    expect(screen.getByRole("row", { name: /Quiet tool/ })).toHaveTextContent("Ready · nothing captured yet");
    expect(screen.queryByRole("button", { name: /Quiet tool/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Kimi Code" })).toBeEnabled();

    expect(screen.getByText(/2 things to fix/)).toBeInTheDocument();
    expect(screen.getByText(/DeepSeek Harness recall is not connected/)).toBeInTheDocument();
    expect(screen.getByText(/Kimi Code is not connected/)).toBeInTheDocument();
    expect(screen.queryByText(/stopped sending/)).not.toBeInTheDocument();
  });
});
