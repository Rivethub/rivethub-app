import type { Account, MemoryClient } from "@rivethub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClient } from "../client/context";
import { keys } from "../client/queries";

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

export function useEmailSignIn(onSignedIn?: (account: Account) => void) {
  const client = useClient();
  const qc = useQueryClient();
  const [state, setState] = useState<SignInState>({ phase: "idle" });
  const running = useRef<AbortController | null>(null);
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;
  useEffect(() => () => running.current?.abort(), []);

  const cancel = useCallback(() => {
    running.current?.abort();
    running.current = null;
    setState({ phase: "idle" });
  }, []);

  const start = useCallback(
    async (email: string) => {
      running.current?.abort();
      const controller = new AbortController();
      running.current = controller;
      setState({ phase: "waiting", email });
      try {
        const account = await signInWithEmail(client, email, controller.signal);
        running.current = null;
        setState({ phase: "idle" });
        await qc.invalidateQueries({ queryKey: keys.account });
        signedIn.current?.(account);
      } catch (error) {
        if (controller.signal.aborted) return;
        running.current = null;
        setState({ phase: "failed", error });
      }
    },
    [client, qc],
  );

  return { state, start, cancel };
}
