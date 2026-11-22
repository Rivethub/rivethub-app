import type { BuilderPause, IsoTime } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";

const ENTITY_PAUSED_AT = new Date(2026, 10, 3, 9, 30).toISOString() as IsoTime;

function hubWith(upkeep: Partial<NonNullable<AppClient["upkeep"]>>) {
  const base = createSampleClient();
  const client = { ...base, upkeep: { ...base.upkeep!, ...upkeep } } as AppClient;
  render(<App client={client} history={createMemoryHistory({ initialEntries: ["/settings/connections"] })} />);
}

const running = (role: BuilderPause["role"], queued = 0): BuilderPause => ({ role, paused: false, queued });
const initial = (): BuilderPause[] => [
  running("categorizer"),
  running("wiki-builder", 12),
  { role: "entity-builder", paused: true, pausedAt: ENTITY_PAUSED_AT, pausedBy: "owner", queued: 4210 },
];

describe("Background builders", () => {
  it("shows one switch per builder with its state and queue", async () => {
    hubWith({ builderPauses: async () => initial() });
    const section = await screen.findByRole("region", { name: "Background builders" });
    expect(within(section).getByRole("switch", { name: "Filing" })).toBeChecked();
    expect(within(section).getByRole("switch", { name: "Wiki builder" })).toBeChecked();
    const entity = within(section).getByRole("switch", { name: "Entity builder" });
    expect(entity).not.toBeChecked();
    expect(section).toHaveTextContent("Running · 12 jobs waiting");
    expect(section).toHaveTextContent("Paused since Nov 3, 09:30 · 4,210 jobs waiting");
  });

  it("pauses and resumes through the hub and shows what it answers", async () => {
    const setBuilderPaused = vi.fn(async (role: BuilderPause["role"], paused: boolean): Promise<BuilderPause> =>
      paused ? { role, paused, pausedAt: ENTITY_PAUSED_AT, pausedBy: "owner", queued: 12 } : running(role, 4210));
    hubWith({ builderPauses: async () => initial(), setBuilderPaused });
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Background builders" });

    await user.click(within(section).getByRole("switch", { name: "Wiki builder" }));
    expect(setBuilderPaused).toHaveBeenLastCalledWith("wiki-builder", true);
    await waitFor(() => expect(within(section).getByRole("switch", { name: "Wiki builder" })).not.toBeChecked());
    expect(section).toHaveTextContent("Paused since Nov 3, 09:30 · 12 jobs waiting");

    await user.click(within(section).getByRole("switch", { name: "Entity builder" }));
    expect(setBuilderPaused).toHaveBeenLastCalledWith("entity-builder", false);
    await waitFor(() => expect(within(section).getByRole("switch", { name: "Entity builder" })).toBeChecked());
  });

  it("says so beside the switch when the hub refuses, and leaves it where it was", async () => {
    hubWith({ builderPauses: async () => initial(), setBuilderPaused: async () => { throw new Error("503 /api/memory/workers/categorizer/pause: worker pauses unavailable"); } });
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Background builders" });
    await user.click(within(section).getByRole("switch", { name: "Filing" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("Could not pause the filing. 503 /api/memory/workers/categorizer/pause: worker pauses unavailable");
    expect(within(section).getByRole("switch", { name: "Filing" })).toBeChecked();
  });

  it("leaves the section out of a hub that cannot pause, or for a caller who is not its owner", async () => {
    hubWith({ builderPauses: async () => null });
    await screen.findByRole("heading", { name: "Who does the work" });
    expect(screen.queryByRole("region", { name: "Background builders" })).not.toBeInTheDocument();
  });
});
