import type { DraftReport, ShareServer } from "@rivethub/contracts";
import { useQuery } from "@tanstack/react-query";
import { useShareClient } from "../client/context";
import { Button } from "../components/ui";
import { confirmCounts } from "./sendModel";
import { Card } from "./ui";
import { hostOf } from "./format";

/** Step 5: one screen that states exactly what leaves. The counts here are the ones rh checks against the draft. */
export function Confirm({ report, server, signed, busy, onSend, onBack }: { report: DraftReport; server: ShareServer; signed: boolean; busy: boolean; onSend: () => void; onBack: () => void }) {
  const share = useShareClient()!;
  const key = useQuery({ queryKey: ["share", "key"], queryFn: () => share.key(), retry: false });
  const counts = confirmCounts(report);
  const hub = server.hub;
  return (
    <div className="flex flex-col gap-4">
      <Card title="Ready to share">
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted-foreground">Sessions</dt>
          <dd className="m-0">{counts.sessions}</dd>
          <dt className="text-muted-foreground">Flags you kept as they were</dt>
          <dd className="m-0">{counts.keptFlags}</dd>
          <dt className="text-muted-foreground">Destination</dt>
          <dd className="m-0">{hub === undefined ? hostOf(server.origin) : `${hub} (${hostOf(server.origin)})`}</dd>
          {hub === undefined ? (
            <>
              <dt className="text-muted-foreground">Signed as</dt>
              <dd className="m-0 font-mono text-[13px]">{signed ? (key.data?.fingerprint ?? "this machine's key") : "not signed (arrives unverified)"}</dd>
              <dt className="text-muted-foreground">Lifetime</dt>
              <dd className="m-0">Works once, and expires after 7 days.</dd>
            </>
          ) : (
            server.user !== undefined && (
              <>
                <dt className="text-muted-foreground">Added as</dt>
                <dd className="m-0">{server.user}</dd>
              </>
            )
          )}
        </dl>
        <p className="m-0 text-[13px]">{report.bestEffort}</p>
        <p className="m-0 text-[13px] text-muted-foreground">
          {hub === undefined
            ? "Sharing seals the bundle, uploads it and shows you a code. The code opens it, so you pass it on yourself."
            : `Sharing seals the bundle and adds its sessions to ${hub}. No code is made.`}
        </p>
      </Card>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <Button variant="ghost" size="md" onClick={onBack} disabled={busy}>Back</Button>
        <span className="flex-1" />
        <Button variant="primary" size="md" disabled={busy} onClick={onSend}>{busy ? (hub === undefined ? "Sealing and uploading…" : "Sealing and adding…") : "Share"}</Button>
      </div>
    </div>
  );
}
