import { RouteMissingError } from "@rivethub/client";
import { shortDate } from "@rivethub/client-runtime/format";
import type { Hub, ReadyBundle, ShareServer } from "@rivethub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useShareClient } from "../client/context";
import { useHubs } from "../client/queries";
import { Button, Dot, Loading } from "../components/ui";
import { SERVERS_KEY, shareServerStatus, shareServerTitle, TeamForm, useShareServers } from "./destination";
import { describeFailure, type Failure } from "./failure";
import { sameHost, sizeLabel } from "./format";
import { Card, FailureNote } from "./ui";

export const BUNDLES_KEY = ["share", "bundles"] as const;

/** The hub in `/api/hubs` that a share server is, matched on its host or on the hub name rh gave it. */
function hubOf(server: ShareServer, hubs: Hub[]): Hub | undefined {
  return hubs.find((hub) => !hub.current && (sameHost(hub.url, server.origin) || (server.delivery === "push" && hub.name === server.hub)));
}

function Online({ online }: { online: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <Dot color={online ? "var(--success)" : "var(--muted-foreground)"} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

/** Where this machine can send to: each share server, and any other hub it knows that is not set up for sharing yet. */
export function Connected() {
  const client = useQueryClient();
  const hubs = useHubs();
  const { servers, destinations } = useShareServers();
  const [failure, setFailure] = useState<Failure | null>(null);
  const known = hubs.data ?? [];
  const matched = new Set((destinations ?? []).flatMap((server) => hubOf(server, known)?.id ?? []));
  const others = known.filter((hub) => !hub.current && !matched.has(hub.id));
  return (
    <Card title="Connected">
      {failure && <FailureNote failure={failure} onDismiss={() => setFailure(null)} />}
      {servers.isPending && <Loading label="Loading servers" />}
      {servers.isError && <FailureNote failure={describeFailure(servers.error, "send")} />}
      {destinations && (
        <ul aria-label="Connected servers" className="m-0 flex list-none flex-col gap-2 p-0">
          {destinations.map((server) => {
            const hub = hubOf(server, known);
            return (
              <li key={server.origin} aria-label={shareServerTitle(server)} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{shareServerTitle(server)}</span>
                  <span className="text-[12px] text-muted-foreground">{shareServerStatus(server)}</span>
                </span>
                {hub && <Online online={hub.online} />}
              </li>
            );
          })}
          {others.map((hub) => (
            <li key={hub.id} aria-label={hub.name} className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-input px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{hub.name}</span>
                <span className="text-[12px] text-muted-foreground">Memory hub · not set up for sharing. Add it as a team server to send to it.</span>
              </span>
              <Online online={hub.online} />
            </li>
          ))}
          {destinations.length === 0 && others.length === 0 && <li className="text-muted-foreground">No share servers are set up. Add a team server to send sessions to it.</li>}
        </ul>
      )}
      <TeamForm
        onSignedIn={() => {
          setFailure(null);
          void client.invalidateQueries({ queryKey: SERVERS_KEY });
        }}
        onFail={(error) => setFailure(describeFailure(error, "send"))}
      />
    </Card>
  );
}

/** Bundles exported and sanitized on this machine. Sending one opens it as a draft, so its open flags are reviewed before it leaves. */
export function ReadyBundles({ opening, onSend }: { opening: string | null; onSend: (name: string) => void }) {
  const share = useShareClient()!;
  const bundles = useQuery({ queryKey: BUNDLES_KEY, queryFn: () => share.bundles(), retry: false });
  // An rh without the bundles route has nothing exported to offer.
  if (bundles.error instanceof RouteMissingError) return null;
  return (
    <Card title="Ready to share">
      {bundles.isPending && <Loading label="Loading bundles" />}
      {bundles.isError && <FailureNote failure={describeFailure(bundles.error, "send")} />}
      {bundles.data && bundles.data.length === 0 && <p className="m-0 text-[13px] text-muted-foreground">No exported bundles are waiting. Find sessions below to sanitize and send them.</p>}
      {bundles.data && bundles.data.length > 0 && (
        <ul aria-label="Ready bundles" className="m-0 flex list-none flex-col gap-2 p-0">
          {bundles.data.map((bundle) => (
            <BundleRow key={bundle.name} bundle={bundle} busy={opening === bundle.name} disabled={opening !== null} onSend={() => onSend(bundle.name)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function BundleRow({ bundle, busy, disabled, onSend }: { bundle: ReadyBundle; busy: boolean; disabled: boolean; onSend: () => void }) {
  return (
    <li aria-label={bundle.name} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{bundle.name}</span>
        <span className="text-[12px] text-muted-foreground">
          {bundle.sessions} {bundle.sessions === 1 ? "session" : "sessions"} · {sizeLabel(bundle.bytes)} · {shortDate(bundle.createdAt)}
          {!bundle.sanitized && " · not sanitized yet, it is scanned when you send it"}
        </span>
        {bundle.openFlags > 0 && (
          <span className="text-[12px] text-warning">
            {bundle.openFlags} {bundle.openFlags === 1 ? "flag needs" : "flags need"} your decision before it can leave.
          </span>
        )}
      </span>
      <Button size="sm" variant="primary" aria-label={`Send ${bundle.name}`} disabled={disabled} onClick={onSend}>{busy ? "Opening…" : "Send"}</Button>
    </li>
  );
}
