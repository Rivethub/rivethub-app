import type { HarnessStatus } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { harnessAction } from "./connections";

function tool(method: string, capture: string, recall: string): HarnessStatus {
  return {
    id: "kimi" as HarnessStatus["id"],
    name: "Kimi Code",
    found: true,
    capture: { method, state: capture, detail: "" },
    recall: { state: recall, detail: "" },
    canConnect: true,
  };
}

describe("harnessAction", () => {
  it("offers recall for a tool rh reads from a store, where there is no capture to install", () => {
    expect(harnessAction(tool("store-scan", "not-connected", "not-connected"))).toEqual({ label: "Connect recall", part: "recall" });
    expect(harnessAction(tool("client-push", "not-connected", "not-connected"))).toEqual({ label: "Connect recall", part: "recall" });
  });

  it("offers capture first for a tool rh hooks into", () => {
    expect(harnessAction(tool("hook", "not-connected", "not-connected"))).toEqual({ label: "Connect", part: "capture" });
  });

  it("offers nothing when both parts are wired or only quiet", () => {
    expect(harnessAction(tool("store-scan", "not-connected", "connected"))).toBeNull();
    expect(harnessAction(tool("hook", "stale", "connected"))).toBeNull();
  });
});
