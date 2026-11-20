import { describe, expect, it } from "vitest";
import { armReturn, isMemoryItemPath, isSafeReturn, RETURN_TO_KEY, takeReturn } from "./return-to";

describe("memory item paths", () => {
  it("accepts a session or topic id and nothing else", () => {
    expect(isMemoryItemPath("/sessions/s-retention")).toBe(true);
    expect(isMemoryItemPath("/topics/rh-08")).toBe(true);
    expect(isMemoryItemPath("/sessions")).toBe(false);
    expect(isMemoryItemPath("/topics")).toBe(false);
    expect(isMemoryItemPath("/sessions/s-retention/extra")).toBe(false);
    expect(isMemoryItemPath("/entities/nas-01")).toBe(false);
  });
});

describe("return path", () => {
  it("restores a stored memory link only when the login page landed on /", () => {
    armReturn("/sessions/s-retention?embed=1");
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe("/sessions/s-retention?embed=1");
    expect(takeReturn("/topics/rh-08", "")).toBeNull();
    armReturn("/sessions/s-retention?embed=1");
    expect(takeReturn("/", "")).toBe("/sessions/s-retention?embed=1");
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  it("does not restore the page the browser is already on, or an off-origin path", () => {
    armReturn("/?embed=1");
    expect(takeReturn("/", "?embed=1")).toBeNull();
    armReturn("//evil.example/sessions/x");
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
    sessionStorage.setItem(RETURN_TO_KEY, "https://evil.example/sessions/x");
    expect(takeReturn("/", "")).toBeNull();
    expect(isSafeReturn("/sessions/a?embed=1")).toBe(true);
    expect(isSafeReturn("/sessions/../topics/a")).toBe(false);
  });
});
