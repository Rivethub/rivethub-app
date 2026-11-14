import type { Account, MemoryClient, SignInStarted } from "@rivethub/contracts";

function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, ms);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

export async function signInWithDevice(
  client: Pick<MemoryClient, "signIn" | "pollSignIn">,
  signal: AbortSignal,
  started: (details: SignInStarted) => void,
): Promise<Account> {
  const details = await client.signIn();
  signal.throwIfAborted();
  started(details);
  const deadline = Date.now() + details.expiresIn * 1000;
  for (;;) {
    await pause(Math.max(1000, details.pollIntervalMs), signal);
    if (Date.now() >= deadline) throw new Error("The code expired. Try signing in again.");
    const progress = await client.pollSignIn();
    if (progress.status === "signed-in") return progress.account;
    if (progress.status === "expired") throw new Error("The code expired. Try signing in again.");
    if (progress.status === "denied") throw new Error("Sign-in was refused in the browser. You can try again.");
  }
}

export type SignInState = { phase: "idle" | "starting" } | { phase: "waiting"; details: SignInStarted } | { phase: "failed"; error: unknown };
