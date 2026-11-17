import type { HarnessStatus, IsoTime } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";

function renderWith(path: string, change: (c: AppClient) => Partial<AppClient>) {
  const base = createSampleClient();
  return render(<App client={{ ...base, ...change(base) } as AppClient} history={createMemoryHistory({ initialEntries: [path] })} />);
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

  it("refetches while Connections is open, and not on other screens", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let harnessCalls = 0;
    let jobCalls = 0;
    const count = (c: AppClient): Partial<AppClient> => ({
      harnesses: async () => {
        harnessCalls += 1;
        return c.harnesses();
      },
      modelJobs: async () => {
        jobCalls += 1;
        return c.modelJobs();
      },
    });
    const connections = renderWith("/settings/connections", count);
    await screen.findByRole("button", { name: "Rescan" });
    expect(harnessCalls).toBe(1);
    expect(jobCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(15_000);
    await waitFor(() => expect(harnessCalls).toBe(2));
    expect(jobCalls).toBe(2);
    connections.unmount();

    harnessCalls = 0;
    renderWith("/", count);
    await screen.findByRole("region", { name: /What changed/ });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const afterLoad = harnessCalls;
    await vi.advanceTimersByTimeAsync(15_000);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(harnessCalls).toBe(afterLoad);
  });

  it("refetches Connections when the window becomes visible again", async () => {
    let harnessCalls = 0;
    renderWith("/settings/connections", (c) => ({
      harnesses: async () => {
        harnessCalls += 1;
        return c.harnesses();
      },
    }));
    await screen.findByRole("button", { name: "Rescan" });
    const loaded = harnessCalls;
    window.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(harnessCalls).toBeGreaterThan(loaded));
  });

  it("says when a rescan finished, including when nothing changed", async () => {
    let calls = 0;
    let release: () => void = () => {};
    renderWith("/settings/connections", (c) => ({
      harnesses: async () => {
        const list = await c.harnesses();
        calls += 1;
        if (calls > 1) await new Promise<void>((resolve) => { release = resolve; });
        return list;
      },
    }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Rescan" }));
    expect(await screen.findByRole("button", { name: "Scanning…" })).toBeDisabled();
    expect(screen.queryByText("Scanned just now")).not.toBeInTheDocument();
    release();
    expect(await screen.findByText("Scanned just now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rescan" })).toBeEnabled();
    expect(screen.getByRole("row", { name: /Claude Code/ })).toBeInTheDocument();
  });

  it("shows each model as read-only text, and the embedder's own model", async () => {
    renderWith("/settings/connections", (c) => ({
      harnesses: async () => (await c.harnesses()).map((h) => ({ ...h, canConnect: false, capture: { ...h.capture, state: "receiving" as const }, recall: { state: "connected" as const, detail: "yes" } })),
      modelJobs: async () => [
        { role: "default", provider: "claude-cli", model: "opus", inheritsDefault: false, health: "healthy", detail: "inherited by summarizer, embedder", queued: 0 },
        { role: "summarizer", inheritsDefault: true, health: "healthy", detail: "9 queued", queued: 9 },
        { role: "embedder", provider: "http://10.4.20.12:9402", model: "nemotron-embed-8b", inheritsDefault: true, health: "healthy", detail: "idle", queued: 0 },
        { role: "wiki-writer", provider: "claude-cli", model: "opus", inheritsDefault: true, health: "unconfigured", detail: "no model is configured", queued: 0 },
      ],
    }));
    const embedder = (await screen.findByText("Embedder")).parentElement!.parentElement!;
    expect(embedder).toHaveTextContent("http://10.4.20.12:9402");
    expect(embedder).toHaveTextContent("nemotron-embed-8b");
    expect(embedder).not.toHaveTextContent(/Default ·/);
    expect(embedder.querySelector(".border-input")).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/hub's configuration/)).toBeInTheDocument();

    const wiki = screen.getByText("Wiki writer").parentElement!.parentElement!;
    expect(wiki).toHaveTextContent("Not set");
    expect(wiki).not.toHaveTextContent("opus");
    expect(wiki).not.toHaveTextContent(/Default ·/);
    expect(screen.getByText("Summarizer").parentElement!.parentElement).toHaveTextContent("Default · claude-cli opus");
  });
});

afterEach(() => {
  vi.useRealTimers();
});
