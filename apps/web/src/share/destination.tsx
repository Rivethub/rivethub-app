import type { ShareLoginStep, ShareServer } from "@rivethub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { withFreshLogin } from "../client/auth";
import { useShareClient } from "../client/context";
import { Button, cx, Loading } from "../components/ui";
import { describeFailure, type Failure } from "./failure";
import { Card, FailureNote, field } from "./ui";
import { hostOf, sameServer } from "./format";

export const SERVERS_KEY = ["share", "servers"] as const;

export function shareServerTitle(server: ShareServer): string {
  return server.kind === "cloud" ? "rivethub.cloud" : hostOf(server.origin);
}

export function shareServerStatus(server: ShareServer): string {
  const kind = server.kind === "cloud" ? "RivetHub Cloud drop box" : "Team server";
  const who = server.signedIn ? `signed in${server.user ? ` as ${server.user}` : ""}` : "signed out";
  return `${kind} · ${who}${server.default ? " · default" : ""}`;
}

/** Step 4: where the sealed bundle goes. A server is usable once you are signed in to it. */
export function Destination({ server, signed, onServer, onSigned, onContinue, onBack }: { server: string | undefined; signed: boolean; onServer: (origin: string) => void; onSigned: (signed: boolean) => void; onContinue: () => void; onBack: () => void }) {
  const share = useShareClient()!;
  const client = useQueryClient();
  const servers = useQuery({ queryKey: SERVERS_KEY, queryFn: () => share.servers(), retry: false });
  const key = useQuery({ queryKey: ["share", "key"], queryFn: () => share.key(), retry: false });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [signingIn, setSigningIn] = useState<ShareServer | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: SERVERS_KEY });
  const selectSignedIn = (origin: string) =>
    client.fetchQuery({ queryKey: SERVERS_KEY, queryFn: () => share.servers(), staleTime: 0 }).then(
      (fresh) => onServer(fresh.servers.find((s) => sameServer(s.origin, origin))?.origin ?? origin),
      fail,
    );
  const usable = servers.data?.servers.find((s) => s.signedIn && s.default);
  useEffect(() => {
    if (server === undefined && usable) onServer(usable.origin);
  }, [server, usable, onServer]);
  const chosen = servers.data?.servers.find((s) => s.origin === server);
  const fail = (error: unknown) => setFailure(describeFailure(error, "send"));
  return (
    <div className="flex flex-col gap-4">
      {failure && <FailureNote failure={failure} onDismiss={() => setFailure(null)} />}
      <Card title="Where should it go?">
        {servers.isPending && <Loading label="Loading servers" />}
        {servers.isError && <FailureNote failure={describeFailure(servers.error, "send")} />}
        {servers.data && servers.data.servers.length === 0 && <p className="m-0 text-muted-foreground">No share servers are set up. Add a team server below.</p>}
        {servers.data && servers.data.servers.length > 0 && (
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="sr-only">Share server</legend>
            {servers.data.servers.map((s) => (
              <div key={s.origin} className={cx("flex flex-wrap items-center gap-3 rounded-lg border p-3", server === s.origin ? "border-primary" : "border-border")}>
                <label className={cx("flex min-w-0 flex-1 items-center gap-3", s.signedIn ? "cursor-pointer" : "opacity-80")}>
                  <input type="radio" name="share-server" disabled={!s.signedIn} checked={server === s.origin} onChange={() => onServer(s.origin)} className="accent-primary" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{shareServerTitle(s)}</span>
                    <span className="text-[12px] text-muted-foreground">{shareServerStatus(s)}</span>
                  </span>
                </label>
                {!s.signedIn && s.kind === "cloud" && <Button size="sm" aria-label={`Sign in to ${hostOf(s.origin)}`} onClick={() => setSigningIn(s)}>Sign in</Button>}
                {s.signedIn && (
                  <Button size="xs" variant="ghost" aria-label={`Sign out of ${hostOf(s.origin)}`} onClick={() => void share.logout(s.origin).then(refresh, fail)}>Sign out</Button>
                )}
              </div>
            ))}
          </fieldset>
        )}
        {signingIn && (
          <DeviceLogin
            origin={signingIn.origin}
            onSignedIn={(origin) => {
              setSigningIn(null);
              void selectSignedIn(origin);
            }}
            onCancel={() => setSigningIn(null)}
            onFail={(error) => {
              setSigningIn(null);
              fail(error);
            }}
          />
        )}
        <TeamForm
          onSignedIn={(origin) => void selectSignedIn(origin)}
          onFail={fail}
        />
      </Card>

      <Card title="Signing">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" checked={signed} onChange={(e) => onSigned(e.target.checked)} className="mt-1 accent-primary" />
          <span className="flex flex-col">
            <span>Sign this bundle with this machine's key</span>
            <span className="text-[12px] text-muted-foreground">
              {key.data ? <>The receiver sees who sent it and can check <span className="font-mono">{key.data.fingerprint}</span>.</> : "The receiver sees who sent it and can check the key."} Unsigned bundles arrive as unverified.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <Button variant="ghost" size="md" onClick={onBack}>Back</Button>
        <span className="flex-1 text-[13px] text-muted-foreground">{chosen ? `Sending to ${hostOf(chosen.origin)}.` : "Choose a server you are signed in to."}</span>
        <Button variant="primary" size="md" disabled={!chosen?.signedIn} onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}

/** RFC 8628 device sign-in: show the code, send the person to the approval page, poll until rh reports it done. */
function DeviceLogin({ origin, onSignedIn, onCancel, onFail }: { origin: string; onSignedIn: (origin: string) => void; onCancel: () => void; onFail: (error: unknown) => void }) {
  const share = useShareClient()!;
  const [step, setStep] = useState<Extract<ShareLoginStep, { state: "started" }> | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (login: string, seconds: number) => {
      timer = setTimeout(async () => {
        try {
          const next = await share.pollLogin(login);
          if (!live.current) return;
          if (next.state === "signed-in") onSignedIn(next.origin);
          else await poll(login, next.state === "pending" ? next.interval : seconds);
        } catch (error) {
          if (live.current) onFail(error);
        }
      }, seconds * 1000);
    };
    share
      .login({ kind: "cloud", origin })
      .then((started) => {
        if (!live.current) return;
        if (started.state !== "started") return onFail(new Error("rh did not start a sign-in"));
        setStep(started);
        return poll(started.login, started.interval);
      })
      .catch((error: unknown) => live.current && onFail(error));
    return () => {
      live.current = false;
      clearTimeout(timer);
    };
  }, [origin]);
  return (
    <div role="status" className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5">
      {!step ? (
        <p className="m-0 text-muted-foreground">Starting the sign-in…</p>
      ) : (
        <>
          <p className="m-0 text-[13px]">Approve this sign-in at {hostOf(step.verificationUrl)}. Check that it shows this code:</p>
          <p aria-label={`Sign-in code ${step.userCode}`} className="m-0 font-mono text-[28px] font-semibold tracking-[0.18em]">{step.userCode}</p>
          <p className="m-0"><a href={step.verificationUrl} target="_blank" rel="noreferrer noopener">Open the approval page</a></p>
          <p className="m-0 text-[12px] text-muted-foreground">Waiting for you to approve it. This window updates by itself.</p>
        </>
      )}
      <div><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </div>
  );
}

/** A team server takes a token that its admin made for you. It is sent once, kept by rh, and cleared from this form. */
export function TeamForm({ onSignedIn, onFail }: { onSignedIn: (origin: string) => void; onFail: (error: unknown) => void }) {
  const share = useShareClient()!;
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^https?:\/\/[^\s/]+/.test(origin.trim()) && token.trim() !== "";
  if (!open) return <div><Button size="sm" onClick={() => setOpen(true)}>Add a team server</Button></div>;
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const sent = { kind: "team" as const, origin: origin.trim(), token: token.trim() };
        setToken("");
        setBusy(true);
        withFreshLogin(() => share.login(sent))
          .then((step) => {
            if (step.state === "signed-in") {
              setOpen(false);
              setOrigin("");
              onSignedIn(step.origin);
            }
          }, onFail)
          .finally(() => setBusy(false));
      }}
    >
      <label className="flex flex-col gap-1 text-[12px]">
        Server address
        <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://rivet.example.org" inputMode="url" autoComplete="off" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[12px]">
        Your token for that server
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} className={`${field} font-mono`} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!valid || busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setToken(""); }}>Cancel</Button>
      </div>
    </form>
  );
}
