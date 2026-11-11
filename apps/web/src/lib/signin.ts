import { keys } from "@rivethub/client-runtime/query-keys";
import { signInWithEmail, type SignInState } from "@rivethub/client-runtime/sign-in";
import type { Account } from "@rivethub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClient } from "../client/context";

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
