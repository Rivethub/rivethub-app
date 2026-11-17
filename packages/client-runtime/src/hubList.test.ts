import type { Hub, HubId } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { canSwitchTo, currentHubSummary } from "./hubList";

const hub = (over: Partial<Hub>): Hub => ({ id: "h" as HubId, name: "desk", kind: "local", url: "http://127.0.0.1:5174", online: true, detail: "This machine", current: false, ...over });

describe("currentHubSummary", () => {
  it("says the app is not connected when no hub is current", () => {
    expect(currentHubSummary(undefined, 3)).toEqual({ name: "No hub", meta: "Not connected", online: false });
    expect(currentHubSummary([hub({})], 3)).toEqual({ name: "No hub", meta: "Not connected", online: false });
  });

  it("counts receiving harnesses on a local hub and shows a team hub's detail", () => {
    expect(currentHubSummary([hub({ current: true })], 2).meta).toBe("Local hub · 2 tools");
    expect(currentHubSummary([hub({ current: true })], undefined).meta).toBe("Local hub");
    expect(currentHubSummary([hub({ current: true })], 4, ["household"]).meta).toBe("household · Local hub · 4 tools");
    expect(currentHubSummary([hub({ current: true })], 4, ["household", "lab"]).meta).toBe("household, lab · Local hub · 4 tools");
    expect(currentHubSummary([hub({ current: true, kind: "team", detail: "team.example" })], 2)).toEqual({ name: "desk", meta: "team.example", online: true });
  });
});

describe("canSwitchTo", () => {
  it("allows only another hub that answers and has an address", () => {
    expect(canSwitchTo(hub({}))).toBe(true);
    expect(canSwitchTo(hub({ current: true }))).toBe(false);
    expect(canSwitchTo(hub({ online: false }))).toBe(false);
    expect(canSwitchTo(hub({ url: "#" }))).toBe(false);
  });
});
