import { buildJourney } from "../src/lib/journey";
import { isQuietSession, quietSessionNote, visibleSessions, visibleTodayEntries } from "../src/lib/sessions";

describe("quiet sessions", () => {
  const row = (messageCount: number, kept = false) => ({ id: `${messageCount}-${kept}`, messageCount, kept });

  it("hides sessions with no messages that are not kept", () => {
    const items = [row(3), row(0), row(0, true), row(0)];
    expect(isQuietSession(items[1]!)).toBe(true);
    expect(isQuietSession(items[2]!)).toBe(false);
    const hidden = visibleSessions(items, false);
    expect(hidden.shown.map((item) => item.id)).toEqual(["3-false", "0-true"]);
    expect(hidden.hidden).toBe(2);
    expect(quietSessionNote(hidden.hidden, false)).toBe("2 sessions with no messages are hidden.");
    const shown = visibleSessions(items, true);
    expect(shown.shown).toHaveLength(4);
    expect(quietSessionNote(1, false)).toBe("1 session with no messages is hidden.");
    expect(quietSessionNote(2, true)).toBe("Showing 2 sessions with no messages.");
    expect(quietSessionNote(0, false)).toBeNull();
  });

  it("leaves a today entry out when the session said nothing and changed nothing", () => {
    const entries = [
      { session: { messageCount: 0 }, changes: [] as string[] },
      { session: { messageCount: 0 }, changes: ["filed"] },
      { session: { messageCount: 4 }, changes: [] as string[] },
      { session: { messageCount: 0, messageCountUnknown: true as const }, changes: [] as string[] },
    ];
    expect(visibleTodayEntries(entries)).toEqual([entries[1], entries[2], entries[3]]);
  });

  it("does not treat an unknown message count as an empty session", () => {
    expect(isQuietSession({ messageCount: 0, messageCountUnknown: true, kept: false })).toBe(false);
  });
});

describe("journey", () => {
  const fresh = { sessions: 0, capturing: false, recalling: false, hasModel: false, pins: 0, done: [] as const };

  it("has nine steps in five stages and leaves out the keyboard jump", () => {
    const journey = buildJourney(fresh);
    expect(journey.steps).toHaveLength(9);
    expect(journey.steps.map((step) => step.id)).not.toContain("palette");
    expect(new Set(journey.steps.map((step) => step.stage)).size).toBe(5);
    expect(journey.next?.id).toBe("capture");
    expect(journey.finished).toBe(false);
    expect(journey.stage.title).toBe("Capture");
  });

  it("treats a captured session as the first two steps and a remembered search as done", () => {
    const journey = buildJourney({ ...fresh, sessions: 2, capturing: true, done: ["search"] });
    expect(journey.steps.find((step) => step.id === "capture")?.done).toBe(true);
    expect(journey.steps.find((step) => step.id === "first-session")?.done).toBe(true);
    expect(journey.steps.find((step) => step.id === "search")?.done).toBe(true);
    expect(journey.next?.id).toBe("recall");
    expect(journey.doneCount).toBe(3);
  });

  it("finishes when the hub and the remembered steps agree", () => {
    const journey = buildJourney({
      sessions: 1,
      capturing: true,
      recalling: true,
      hasModel: true,
      pins: 1,
      done: ["search", "summary", "review", "share"],
    });
    expect(journey.finished).toBe(true);
    expect(journey.next).toBeUndefined();
    expect(journey.doneCount).toBe(9);
    expect(journey.stage.id).toBe("share");
  });
});
