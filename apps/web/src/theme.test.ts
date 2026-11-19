import { afterEach, describe, expect, it } from "vitest";
import { applyStoredTheme, resolveTheme } from "./theme";

function installHost(initial: "light" | "dark") {
  let mode = initial;
  const listeners = new Set<(appearance: "light" | "dark") => void>();
  (window as { rivethub?: unknown }).rivethub = {
    relogin: async () => null,
    host: {
      name: "T3.1 Code",
      appearance: {
        get: () => mode,
        onChange: (listener: (appearance: "light" | "dark") => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    },
  };
  return (next: "light" | "dark") => {
    mode = next;
    for (const listener of listeners) listener(next);
  };
}

describe("resolveTheme", () => {
  it("uses the host only when nobody has picked a theme", () => {
    expect(resolveTheme(null, "dark")).toBe("t3-dark");
    expect(resolveTheme(null, "light")).toBe("t3-light");
    expect(resolveTheme("nope", "light")).toBe("t3-light");
  });

  it("keeps an explicit choice ahead of the host", () => {
    expect(resolveTheme("everforest", "dark")).toBe("everforest");
    expect(resolveTheme("rivethub", "light")).toBe("rivethub");
  });

  it("stays on RivetHub when there is no host and no choice", () => {
    expect(resolveTheme(null, null)).toBe("rivethub");
    expect(resolveTheme("t3-light", null)).toBe("t3-light");
  });
});

describe("applyStoredTheme", () => {
  afterEach(() => {
    delete (window as { rivethub?: unknown }).rivethub;
    localStorage.clear();
    applyStoredTheme();
  });

  it("follows the host, including a later change, when nothing is saved", () => {
    const set = installHost("dark");
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe("t3-dark");
    set("light");
    expect(document.documentElement.dataset.theme).toBe("t3-light");
  });

  it("does not let the host replace a theme the person picked", () => {
    localStorage.setItem("rivethub.theme", "everforest");
    const set = installHost("dark");
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe("everforest");
    set("light");
    expect(document.documentElement.dataset.theme).toBe("everforest");
  });

  it("keeps the default when no host is present", () => {
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe("rivethub");
  });
});
