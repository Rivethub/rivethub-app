import type { ShareLoginStep, ShareServer, ShareServers } from "@rivethub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { withFreshLogin } from "../client/auth";
import { useShareClient } from "../client/context";
import { useAccount } from "../client/queries";
import { Button, cx, Loading } from "../components/ui";
import { describeFailure, type Failure } from "./failure";
import { Card, FailureNote, field } from "./ui";
import { hostOf, sameServer } from "./format";

export const SERVERS_KEY = ["share", "servers"] as const;

export function shareServerTitle(server: ShareServer): string {
  return server.delivery === "push" ? server.hub : hostOf(server.origin);
}

/** What sending to this server does, in the words the Confirm step repeats. */
export function deliveryLabel(server: ShareServer): string {
  return server.delivery === "push" ? `Push into ${server.hub} as ${server.user ?? "your login there"}` : "Upload and get a share code";
}

export function shareServerStatus(server: ShareServer): string {
  const what = server.delivery === "push" ? `Hub at ${hostOf(server.origin)} · pushes sessions into it` : `${server.kind === "cloud" ? "RivetHub Cloud drop box" : "Share server"} · gives a share code`;
  const who =
    server.delivery === "push" && server.needsReauth
      ? `sign in again to push to ${server.hub}`
      : server.signedIn
        ? `signed in${server.user ? ` as ${server.user}` : ""}`
        : "signed out";
  return `${what} · ${who}${server.default ? " · default" : ""}`;
}

/** A server takes a draft once its login there is live and can do what its delivery needs. */
export const usable = (server: ShareServer) => server.signedIn && !server.needsReauth;

/** Same server, reached the same way: what the sender confirmed is still what will happen. */
export const sameDestination = (a: ShareServer, b: ShareServer) =>
  sameServer(a.origin, b.origin) && a.delivery === b.delivery && (a.delivery !== "push" || (b.delivery === "push" && a.hub === b.hub)) && a.user === b.user;

/** `pending` until both the servers reply and the account have said whether this hub turns RivetHub Cloud off. */
export type CloudPolicy = "pending" | "on" | "off";

export function cloudPolicy(servers: ShareServers | undefined, account: { isPending: boolean; data?: { cloudDisabled?: boolean } | undefined }): CloudPolicy {
  if (servers?.cloudDisabled === true || account.data?.cloudDisabled === true) return "off";
  // An account that failed to load says nothing more than the servers reply already did.
  return servers === undefined || account.isPending ? "pending" : "on";
}

/** A RivetHub Cloud drop box is offered only once the policy has resolved to on. */
export function listedServers(servers: ShareServers, cloud: CloudPolicy): ShareServer[] {
  return servers.servers.filter((s) => cloud === "on" || !(s.kind === "cloud" && s.delivery === "code"));
}

/**
 * The share servers this person can use. When this hub's policy turns RivetHub Cloud off, either in the
 * servers reply or on the account, no cloud server is offered, and so no cloud sign-in either.
 */
export function useShareServers() {
  const share = useShareClient();
  const account = useAccount();
  const servers = useQuery({ queryKey: SERVERS_KEY, queryFn: () => share!.servers(), enabled: share !== null, retry: false });
  const cloud = cloudPolicy(servers.data, account);
  const destinations = servers.data && listedServers(servers.data, cloud);
  return { servers, cloud, cloudDisabled: cloud === "off", destinations };
}

/** Step 4: where the sealed draft goes. rh says how each server takes it: pushed into a hub, or uploaded for a share code. */
export function Destination({ server, signed, onServer, onSigned, onContinue, onBack }: { server: ShareServer | undefined; signed: boolean; onServer: (server: ShareServer) => void; onSigned: (signed: boolean) => void; onContinue: () => void; onBack: () => void }) {
  const share = useShareClient()!;
  const client = useQueryClient();
  const { servers, destinations } = useShareServers();
  const key = useQuery({ queryKey: ["share", "key"], queryFn: () => share.key(), retry: false });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: SERVERS_KEY });
  const selectSignedIn = (origin: string) =>
    client.fetchQuery({ queryKey: SERVERS_KEY, queryFn: () => share.servers(), staleTime: 0 }).then((fresh) => {
      const found = fresh.servers.find((s) => sameServer(s.origin, origin));
      if (found && usable(found)) onServer(found);
    }, fail);
  const fallback = destinations?.find((s) => usable(s) && s.default);
  useEffect(() => {
    if (server === undefined && fallback) onServer(fallback);
  }, [server, fallback, onServer]);
  const chosen = destinations?.find((s) => server !== undefined && sameDestination(s, server) && usable(s));
  // A device sign-in runs only while its server is still offered: a policy that turns cloud off ends it.
  const signingInto = destinations?.find((s) => s.origin === signingIn);
  const fail = (error: unknown) => setFailure(describeFailure(error, "send"));
  return (
    <div className="flex flex-col gap-4">
      {failure && <FailureNote failure={failure} onDismiss={() => setFailure(null)} />}
      <Card title="Where should it go?">
        {servers.isPending && <Loading label="Loading servers" />}
        {servers.isError && <FailureNote failure={describeFailure(servers.error, "send")} />}
        {destinations && destinations.length === 0 && <p className="m-0 text-muted-foreground">No share servers are set up. Add a team server below.</p>}
        {destinations && destinations.length > 0 && (
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="sr-only">Share server</legend>
            {destinations.map((s) => (
              <div key={s.origin} className={cx("flex flex-wrap items-center gap-3 rounded-lg border p-3", chosen?.origin === s.origin ? "border-primary" : "border-border")}>
                <label className={cx("flex min-w-0 flex-1 items-center gap-3", usable(s) ? "cursor-pointer" : "opacity-80")}>
                  <input type="radio" name="share-server" disabled={!usable(s)} checked={chosen?.origin === s.origin} onChange={() => onServer(s)} className="accent-primary" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{shareServerTitle(s)}</span>
                    <span className="text-[12px] text-muted-foreground">{shareServerStatus(s)}</span>
                  </span>
                </label>
                {!s.signedIn && s.kind === "cloud" && <Button size="sm" aria-label={`Sign in to ${hostOf(s.origin)}`} onClick={() => setSigningIn(s.origin)}>Sign in</Button>}
                {s.signedIn && s.needsReauth && (
                  <Button size="sm" aria-label={`Sign in again to ${hostOf(s.origin)}`} onClick={() => (s.kind === "cloud" ? setSigningIn(s.origin) : setRenewing(s.origin))}>Sign in again</Button>
                )}
                {s.signedIn && (
                  <Button size="xs" variant="ghost" aria-label={`Sign out of ${hostOf(s.origin)}`} onClick={() => void share.logout(s.origin).then(refresh, fail)}>Sign out</Button>
                )}
              </div>
            ))}
          </fieldset>
        )}
        {signingInto && (
          <DeviceLogin
            origin={signingInto.origin}
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
          key={renewing ?? "add"}
          {...(renewing === null ? {} : { renew: renewing })}
          onSignedIn={(origin) => {
            setRenewing(null);
            void selectSignedIn(origin);
          }}
          onFail={fail}
        />
      </Card>

      {chosen?.delivery === "code" && (
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
      )}

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <Button variant="ghost" size="md" onClick={onBack}>Back</Button>
        <span className="flex-1 text-[13px] text-muted-foreground">{chosen ? `${deliveryLabel(chosen)}.` : "Choose a server you are signed in to."}</span>
        <Button variant="primary" size="md" disabled={!chosen} onClick={onContinue}>Continue</Button>
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
export function TeamForm({ renew, onSignedIn, onFail }: { renew?: string; onSignedIn: (origin: string) => void; onFail: (error: unknown) => void }) {
  const share = useShareClient()!;
  const [open, setOpen] = useState(renew !== undefined);
  const [origin, setOrigin] = useState(renew ?? "");
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
      {renew !== undefined && <p className="m-0 text-[12px] text-muted-foreground">Your login on {hostOf(renew)} can't push sessions. Paste a new token from its admin that includes memory:import.</p>}
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
