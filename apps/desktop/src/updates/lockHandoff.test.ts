import { describe, expect, it } from "vitest";

import { installWithLockHandoff } from "./lockHandoff";

function fakeLock(acquired = true) {
  const events: string[] = [];
  return {
    events,
    lock: {
      release: () => void events.push("release"),
      acquire: () => (events.push("acquire"), acquired),
    },
  };
}

describe("installWithLockHandoff", () => {
  it("hands the lock to the new copy before installing and keeps it released on success", () => {
    const { events, lock } = fakeLock();
    expect(installWithLockHandoff(lock, () => (events.push("install"), true))).toBe("installed");
    expect(events).toEqual(["release", "install"]);
  });

  it("takes the lock back when the install reports failure", () => {
    const { events, lock } = fakeLock();
    expect(installWithLockHandoff(lock, () => (events.push("install"), false))).toBe("failed");
    expect(events).toEqual(["release", "install", "acquire"]);
  });

  it("takes the lock back when the install throws", () => {
    const { events, lock } = fakeLock();
    const result = installWithLockHandoff(lock, () => {
      events.push("install");
      throw new Error("mv failed");
    });
    expect(result).toBe("failed");
    expect(events).toEqual(["release", "install", "acquire"]);
  });

  it("reports the lock lost when another launch took it during a failed install", () => {
    const { events, lock } = fakeLock(false);
    expect(installWithLockHandoff(lock, () => (events.push("install"), false))).toBe("lost");
    expect(events).toEqual(["release", "install", "acquire"]);
  });
});
