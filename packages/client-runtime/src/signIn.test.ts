import type { Account } from "@rivethub/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { signInWithDevice } from "./signIn";
const account: Account = { email: "you@example.com", updateSource: "rivethub-cloud", channel: "stable", autoDownload: true, version: "0.8.3", crashReports: true, usageCounts: false };
const details = { userCode: "ABCD-EFGH", verificationUri: "https://rivethub.cloud/device", expiresIn: 600, pollIntervalMs: 1000 };
afterEach(() => vi.useRealTimers());
it("shows only public details, then waits for approval", async () => {
  vi.useFakeTimers();
  const started = vi.fn();
  const signIn = vi.fn(async () => details);
  let polls = 0;
  const pollSignIn = vi.fn(async () => ++polls === 1 ? { status: "pending" as const } : { status: "signed-in" as const, account });
  const done = signInWithDevice({ signIn, pollSignIn }, new AbortController().signal, started);
  await vi.advanceTimersByTimeAsync(2000);
  await expect(done).resolves.toEqual(account);
  expect(started).toHaveBeenCalledWith(details);
  expect(signIn).toHaveBeenCalledWith();
});
for (const status of ["expired", "denied"] as const) it(`explains ${status} and permits retry`, async () => {
  vi.useFakeTimers();
  const done = signInWithDevice({ signIn: async () => details, pollSignIn: async () => ({ status }) }, new AbortController().signal, () => {});
  const settled = expect(done).rejects.toThrow(status === "expired" ? /expired/ : /refused/);
  await vi.advanceTimersByTimeAsync(1000);
  await settled;
});
it("stops polling after cancellation", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const pollSignIn = vi.fn(async () => ({ status: "pending" as const }));
  const done = signInWithDevice({ signIn: async () => details, pollSignIn }, controller.signal, () => {});
  const settled = expect(done).rejects.toBeDefined();
  await vi.advanceTimersByTimeAsync(1000);
  controller.abort();
  await settled;
  await vi.advanceTimersByTimeAsync(10000);
  expect(pollSignIn).toHaveBeenCalledTimes(1);
});
