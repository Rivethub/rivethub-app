import { describe, expect, it } from "vitest";

import { installWithLockHandoff } from "./lockHandoff";

function fakeLock() {
  const events: string[] = [];
  return {
    events,
    lock: {
      release: () => void events.push("release"),
      acquire: () => (events.push("acquire"), true),
    },
  };
}

describe("installWithLockHandoff", () => {
  it("hands the lock to the new copy before installing and keeps it released on success", () => {
    const { events, lock } = fakeLock();
    expect(installWithLockHandoff(lock, () => (events.push("install"), true))).toBe(true);
    expect(events).toEqual(["release", "install"]);
  });

  it("takes the lock back when the install reports failure", () => {
    const { events, lock } = fakeLock();
    expect(installWithLockHandoff(lock, () => (events.push("install"), false))).toBe(false);
    expect(events).toEqual(["release", "install", "acquire"]);
  });

  it("takes the lock back and rethrows when the install throws", () => {
    const { events, lock } = fakeLock();
    expect(() =>
      installWithLockHandoff(lock, () => {
        events.push("install");
        throw new Error("mv failed");
      }),
    ).toThrow("mv failed");
    expect(events).toEqual(["release", "install", "acquire"]);
  });
});
