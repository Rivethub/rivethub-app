import type { Account } from "@rivethub/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signInWithEmail } from "../lib/signin";

const account: Account = { email: "phil@example.com", updateSource: "rivethub-cloud", channel: "stable", autoDownload: true, version: "0.8.0", crashReports: true, usageCounts: false };

afterEach(() => vi.useRealTimers());

describe("signInWithEmail", () => {
  it("starts once, polls until the link is followed, then returns the account", async () => {
    vi.useFakeTimers();
    const signIn = vi.fn(async () => ({ requestId: "r1" }));
    const answers = [{ status: "pending" as const }, { status: "pending" as const }, { status: "signed-in" as const, account }];
    const pollSignIn = vi.fn(async () => answers.shift()!);
    const done = signInWithEmail({ signIn, pollSignIn }, "phil@example.com", new AbortController().signal, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(pollSignIn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pollSignIn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(done).resolves.toEqual(account);
    expect(signIn).toHaveBeenCalledOnce();
    expect(signIn).toHaveBeenCalledWith("phil@example.com");
    expect(pollSignIn).toHaveBeenCalledTimes(3);
  });

  it("stops polling when cancelled", async () => {
    vi.useFakeTimers();
    const pollSignIn = vi.fn(async () => ({ status: "pending" as const }));
    const controller = new AbortController();
    const done = signInWithEmail({ signIn: async () => ({ requestId: "r1" }), pollSignIn }, "a@b.co", controller.signal, 1000);
    const settled = expect(done).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(1500);
    controller.abort();
    await settled;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pollSignIn).toHaveBeenCalledTimes(2);
  });

  it("surfaces an expired link from the hub", async () => {
    const pollSignIn = vi.fn(async () => {
      throw new Error("410 the sign-in link expired");
    });
    await expect(signInWithEmail({ signIn: async () => ({ requestId: "r1" }), pollSignIn }, "a@b.co", new AbortController().signal)).rejects.toThrow(/expired/);
  });
});
