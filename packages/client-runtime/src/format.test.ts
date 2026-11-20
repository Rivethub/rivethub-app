import type { EntityId } from "@rivethub/contracts";
import type { ReviewItem } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { ago, dayLabel, filingCreatesTopic, filingTopicName, harnessNames, localDay, parseDay, primaryAction, toolLine, whenLabel } from "./format";

describe("format", () => {
  it("names every tool rh lists as rh names it", () => {
    expect(["opencode", "dsh", "kimi", "omp", "hermes", "cowork"].map((id) => harnessNames[id])).toEqual(["OpenCode", "DeepSeek Harness", "Kimi Code", "Oh My Pi", "Hermes", "Claude Cowork"]);
  });

  const now = new Date(2026, 10, 11, 15, 30);

  it("labels today by time and other days by date", () => {
    expect(dayLabel(new Date(2026, 10, 11, 9, 5).toISOString(), now)).toBe("Today");
    expect(whenLabel(new Date(2026, 10, 11, 9, 5).toISOString(), now)).toBe("09:05");
    expect(whenLabel(new Date(2026, 10, 4, 9, 5).toISOString(), now)).toBe("Nov 4");
  });

  it("round-trips a local day", () => {
    expect(localDay(parseDay("2026-01-09"))).toBe("2026-01-09");
  });

  it("says how long ago, in words", () => {
    const t = now.getTime();
    expect(ago(new Date(t - 30_000).toISOString(), t)).toBe("just now");
    expect(ago(new Date(t - 5 * 60_000).toISOString(), t)).toBe("5 min ago");
    expect(ago(new Date(t - 86_400_000).toISOString(), t)).toBe("1 day ago");
  });

  it("prints a tool's name once", () => {
    expect(toolLine({ name: "Read", summary: "/tmp/synthetic/tool-marathon-2.txt" })).toBe("Read: /tmp/synthetic/tool-marathon-2.txt");
    expect(toolLine({ name: "Read", summary: "Read /tmp/synthetic/tool-marathon-2.txt" })).toBe("Read /tmp/synthetic/tool-marathon-2.txt");
    expect(toolLine({ name: "Read", summary: "Read: Read /tmp/synthetic/tool-marathon-2.txt" })).toBe("Read: Read /tmp/synthetic/tool-marathon-2.txt");
    expect(toolLine({ name: "Bash", summary: "zpool list NAME SIZE" })).toBe("Bash: zpool list NAME SIZE");
    expect(toolLine({ name: "Bash", summary: "failed" })).toBe("Bash: failed");
    expect(toolLine({ name: "tool", summary: "noted" })).toBe("noted");
  });

  it("tells a filing that would create a topic from one that files into a topic that exists", () => {
    const filing = (text: string, after?: string) => ({ group: "filing" as const, text, ...(after === undefined ? {} : { after }) });
    expect(filingCreatesTopic(filing("→ Home lab › Network", "topic-home"))).toBe(false);
    expect(filingCreatesTopic(filing("→ Printers (new topic)", "Printers"))).toBe(true);
    expect(filingCreatesTopic(filing("→ Printers (new topic)  "))).toBe(true);
    expect(filingCreatesTopic({ group: "fact", text: "note (new topic)" })).toBe(false);
    expect(filingTopicName(filing("→ Printers (new topic)", "Printers"))).toBe("Printers");
    expect(filingTopicName(filing("→ Home lab › Printers (new topic)"))).toBe("Home lab › Printers");
    expect(filingTopicName(filing("→ Printers   (new topic)"))).toBe("Printers");
    expect(filingTopicName(filing("name (new topic) more"))).toBe("name (new topic) more");
    expect(filingTopicName(filing("→   (new topic)"))).toBe("");
    expect(filingTopicName(filing("→ Foo (new topic) (new topic)"))).toBe("Foo (new topic)");
    expect(filingTopicName(filing("→ Foo\n(new topic)"))).toBe("Foo");
    expect(filingTopicName(filing("→ Foo \u00a0(new topic)  "))).toBe("Foo");
    expect(filingTopicName(filing("(new topic)"))).toBe("");
    expect(filingTopicName(filing("   "))).toBe("");
  });

  it("reads a long filing that is not a new topic within a tight bound", () => {
    const text = `${" ".repeat(40_000)}x`;
    const started = performance.now();
    expect(filingTopicName({ text })).toBe("x");
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("names a review item's main button", () => {
    const item = (group: ReviewItem["group"], options?: { label: string }[]) => ({ group, options }) as ReviewItem;
    expect(primaryAction(item("conflict", [{ label: "Postgres 17" }]))).toBe("Take Postgres 17");
    expect(primaryAction(item("conflict"))).toBe("Take newer");
    expect(primaryAction(item("filing"))).toBe("File");
  });
});

it("derives entity labels and grouping without a taxonomy or pluralization", async () => {
  const { entityTypeLabel, groupEntities, subjectLabel } = await import("./format.js");
  const entities = [
    { id: "a" as EntityId, title: "A", type: "spacecraft", sessionCount: 1 },
    { id: "b" as EntityId, title: "B", type: "field-notes", sessionCount: 1 },
    { id: "c" as EntityId, title: "C", type: "spacecraft", sessionCount: 1 },
    { id: "d" as EntityId, title: "D", type: "trial_plot", typeName: "Research plots", sessionCount: 1 },
  ];
  expect(groupEntities(entities).map((g) => [g.type, g.label, g.items.length])).toEqual([
    ["spacecraft", "Spacecraft", 2], ["field-notes", "Field notes", 1], ["trial_plot", "Research plots", 1],
  ]);
  expect(groupEntities([])).toEqual([]);
  expect(entityTypeLabel({ type: "FIELD_notes" })).toBe("Field notes");
  expect(entityTypeLabel({ type: "trial_plot", typeName: "NASA research plots" })).toBe("NASA research plots");
  expect(subjectLabel({ kind: "entity", id: "d" as EntityId, title: "D" }, entities)).toBe("Research plots");
  expect(subjectLabel({ kind: "entity", id: "missing" as EntityId, title: "E", type: "field-notes" }, [])).toBe("Field notes");
});
