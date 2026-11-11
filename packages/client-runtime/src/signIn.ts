import type { Account, MemoryClient } from "@rivethub/contracts";

const POLL_MS = 2000;

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/** Starts an email sign-in and polls until the link has been followed. Rejects on an error from the hub or when `signal` aborts. */
export async function signInWithEmail(
  client: Pick<MemoryClient, "signIn" | "pollSignIn">,
  email: string,
  signal: AbortSignal,
  intervalMs = POLL_MS,
): Promise<Account> {
  await client.signIn(email);
  for (;;) {
    signal.throwIfAborted();
    const progress = await client.pollSignIn();
    if (progress.status === "signed-in") return progress.account;
    await pause(intervalMs, signal);
  }
}

export type SignInState = { phase: "idle" } | { phase: "waiting"; email: string } | { phase: "failed"; error: unknown };
