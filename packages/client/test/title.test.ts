import type { IsoTime } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { mapRow } from "../src/rh/catalog.js";

const row = (title: string) => ({
  id: "grok-build:01a1b70a-a8de-73e1-b3b7-cd270e347e73",
  title,
  harness: "grok-build",
  startedAt: "2026-11-07T17:24:00Z" as IsoTime,
  messageCount: 3,
  kept: false,
  trashed: false,
  memoryState: "queued" as const,
});

describe("session titles", () => {
  it("names a session rh could only label with its harness id", () => {
    expect(mapRow(row("01a1b70a-a8de-73e1-b3b7-cd270e347e73"), { kind: "private" }).title).toBe("Untitled session");
    expect(mapRow(row(""), { kind: "private" }).title).toBe("Untitled session");
  });

  it("keeps a real title", () => {
    expect(mapRow(row("Wire the stream"), { kind: "private" }).title).toBe("Wire the stream");
  });
});
