import type { DraftReport, ShareServer } from "@rivethub/contracts";
import { useQuery } from "@tanstack/react-query";
import { useShareClient } from "../client/context";
import { Button } from "../components/ui";
import { confirmCounts } from "./sendModel";
import { Card } from "./ui";
import { deliveryLabel } from "./destination";
import { hostOf } from "./format";

/** Step 5: one screen that states exactly what leaves and how. The counts here are the ones rh checks against the draft. */
export function Confirm({ report, server, signed, busy, onSend, onBack }: { report: DraftReport; server: ShareServer; signed: boolean; busy: boolean; onSend: () => void; onBack: () => void }) {
  const share = useShareClient()!;
  const key = useQuery({ queryKey: ["share", "key"], queryFn: () => share.key(), retry: false });
  const counts = confirmCounts(report);
  return (
    <div className="flex flex-col gap-4">
      <Card title="Ready to share">
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted-foreground">Sessions</dt>
          <dd className="m-0">{counts.sessions}</dd>
          <dt className="text-muted-foreground">Flags you kept as they were</dt>
          <dd className="m-0">{counts.keptFlags}</dd>
          <dt className="text-muted-foreground">Destination</dt>
          <dd className="m-0">{server.delivery === "push" ? `${server.hub} (${hostOf(server.origin)})` : hostOf(server.origin)}</dd>
          <dt className="text-muted-foreground">How</dt>
          <dd className="m-0">{deliveryLabel(server)}</dd>
          {server.delivery === "code" && (
            <>
              <dt className="text-muted-foreground">Signed as</dt>
              <dd className="m-0 font-mono text-[13px]">{signed ? (key.data?.fingerprint ?? "this machine's key") : "not signed (arrives unverified)"}</dd>
              <dt className="text-muted-foreground">Lifetime</dt>
              <dd className="m-0">Works once, and expires after 7 days.</dd>
            </>
          )}
        </dl>
        <p className="m-0 text-[13px]">{report.bestEffort}</p>
        <p className="m-0 text-[13px] text-muted-foreground">
          {server.delivery === "push"
            ? `Sharing seals the draft and pushes its sessions into ${server.hub}${server.user ? ` as ${server.user}` : ""}. No code is made.`
            : "Sharing seals the bundle, uploads it and shows you a code. The code opens it, so you pass it on yourself."}
        </p>
      </Card>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <Button variant="ghost" size="md" onClick={onBack} disabled={busy}>Back</Button>
        <span className="flex-1" />
        <Button variant="primary" size="md" disabled={busy} onClick={onSend}>
          {server.delivery === "push" ? (busy ? "Pushing…" : `Push into ${server.hub}`) : busy ? "Sealing and uploading…" : "Share and get a code"}
        </Button>
      </div>
    </div>
  );
}
