import type { ReviewItem } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { ago, dayLabel, localDay, parseDay, primaryAction, whenLabel } from "./format";

describe("format", () => {
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

  it("names a review item's main button", () => {
    const item = (group: ReviewItem["group"], options?: { label: string }[]) => ({ group, options }) as ReviewItem;
    expect(primaryAction(item("conflict", [{ label: "Postgres 17" }]))).toBe("Take Postgres 17");
    expect(primaryAction(item("conflict"))).toBe("Take newer");
    expect(primaryAction(item("filing"))).toBe("File");
  });
});
