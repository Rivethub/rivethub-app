import type { HostOpenSessionRequest } from "@rivethub/contracts";
import { describe, expect, it, vi } from "vitest";
import { readDesktopBridge } from "./desktop";

const relogin = async () => null;
const request: HostOpenSessionRequest = { sessionId: "s", harness: "claude-code", title: "T", startedAt: "2026-11-01T00:00:00.000Z", handoffPrompt: "go" };
const updates = { getState: vi.fn(), onState: vi.fn(() => () => {}), setChannel: vi.fn(), restartToUpdate: vi.fn() };

describe("readDesktopBridge", () => {
  it("keeps a host whose shape is right, and leaves updates off when the host did not send them", async () => {
    let mode: "light" | "dark" = "dark";
    const listeners = new Set<(appearance: "light" | "dark") => void>();
    const openSession = vi.fn(async () => ({ opened: true as const, how: "handoff" as const }));
    const bridge = readDesktopBridge({
      relogin,
      host: {
        name: " T3.1 Code ",
        appearance: {
          get: () => mode,
          onChange: (listener: (appearance: "light" | "dark") => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        openSession,
      },
    });
    expect(bridge?.updates).toBeUndefined();
    expect(bridge?.host?.name).toBe("T3.1 Code");
    expect(bridge?.host?.appearance?.get()).toBe("dark");
    const seen: string[] = [];
    const stop = bridge?.host?.appearance?.onChange((next) => seen.push(next));
    mode = "light";
    for (const listener of listeners) listener("light");
    for (const listener of listeners) listener("blue" as "light");
    expect(seen).toEqual(["light"]);
    stop?.();
    expect(await bridge?.host?.openSession?.(request)).toEqual({ opened: true, how: "handoff" });
    expect(openSession).toHaveBeenCalledWith(request);
  });

  it("is a bridge with no host when the host is absent", () => {
    const bridge = readDesktopBridge({ relogin, updates });
    expect(bridge?.host).toBeUndefined();
    expect(bridge?.updates?.getState).toBe(updates.getState);
    expect(bridge?.relogin).toBe(relogin);
  });

  it("drops a malformed host or updates block instead of throwing", async () => {
    const broken = readDesktopBridge({
      relogin,
      updates: { getState: "no" },
      host: { name: "T3", appearance: { get: () => "blue", onChange: () => () => {} } },
    });
    expect(broken?.host).toBeUndefined();
    expect(broken?.updates).toBeUndefined();
    expect(broken?.relogin).toBe(relogin);

    expect(readDesktopBridge(null)).toBeNull();
    expect(readDesktopBridge({ host: { name: "T3.1 Code" } })).toBeNull();
    expect(readDesktopBridge({ relogin, host: "T3.1 Code" })?.host).toBeUndefined();
    expect(readDesktopBridge({ relogin, host: { name: "T3.1 Code", openSession: "open" } })?.host).toBeUndefined();
    expect(readDesktopBridge({ relogin, host: { name: "" } })?.host).toBeUndefined();

    const rejecting = readDesktopBridge({
      relogin,
      host: { name: "T3.1 Code", openSession: async () => { throw new Error("busy"); } },
    });
    await expect(rejecting?.host?.openSession?.(request)).resolves.toEqual({ opened: false, reason: "busy" });

    const nonsense = readDesktopBridge({
      relogin,
      host: { name: "T3.1 Code", openSession: async () => ({ opened: "yes" }) },
    });
    await expect(nonsense?.host?.openSession?.(request)).resolves.toEqual({ opened: false, reason: "The host could not open this session." });
  });
});
