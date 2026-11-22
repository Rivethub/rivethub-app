import type { BuilderPause, IsoTime } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { BUILDER_NAME, builderStatus } from "./builderPause";

const entry = (partial: Partial<BuilderPause>): BuilderPause => ({ role: "entity-builder", paused: false, queued: 0, ...partial });

describe("builderStatus", () => {
  const now = new Date(2026, 10, 22, 16, 0);
  const at = (d: Date) => d.toISOString() as IsoTime;

  it("says Running, with the queue only when there is one", () => {
    expect(builderStatus(entry({}), now)).toBe("Running");
    expect(builderStatus(entry({ queued: 12 }), now)).toBe("Running · 12 jobs waiting");
    expect(builderStatus(entry({ queued: 1 }), now)).toBe("Running · 1 job waiting");
  });

  it("says when a pause started and how many jobs are waiting", () => {
    expect(builderStatus(entry({ paused: true, pausedAt: at(new Date(2026, 10, 22, 14, 2)), queued: 4210 }), now)).toBe("Paused since 14:02 today · 4,210 jobs waiting");
    expect(builderStatus(entry({ paused: true, pausedAt: at(new Date(2026, 10, 20, 9, 5)), queued: 3 }), now)).toBe("Paused since Nov 20, 09:05 · 3 jobs waiting");
  });

  it("does not invent a time a hub left out", () => {
    expect(builderStatus(entry({ paused: true }), now)).toBe("Paused");
  });

  it("names every role the hub can pause", () => {
    expect(BUILDER_NAME).toEqual({ categorizer: "Filing", "wiki-builder": "Wiki builder", "entity-builder": "Entity builder" });
  });
});
