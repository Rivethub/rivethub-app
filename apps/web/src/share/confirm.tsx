import type { DraftReport } from "@rivethub/contracts";
import { useQuery } from "@tanstack/react-query";
import { useShareClient } from "../client/context";
import { Button } from "../components/ui";
import { confirmCounts } from "./sendModel";
import { Card } from "./ui";
import { hostOf } from "./format";

/** Step 5: one screen that states exactly what leaves. The counts here are the ones rh checks against the draft. */
export function Confirm({ report, server, signed, busy, onSend, onBack }: { report: DraftReport; server: string; signed: boolean; busy: boolean; onSend: () => void; onBack: () => void }) {
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
          <dd className="m-0">{hostOf(server)}</dd>
          <dt className="text-muted-foreground">Signed as</dt>
          <dd className="m-0 font-mono text-[13px]">{signed ? (key.data?.fingerprint ?? "this machine's key") : "not signed (arrives unverified)"}</dd>
          <dt className="text-muted-foreground">Lifetime</dt>
          <dd className="m-0">Works once, and expires after 7 days.</dd>
        </dl>
        <p className="m-0 text-[13px]">{report.bestEffort}</p>
        <p className="m-0 text-[13px] text-muted-foreground">Sharing seals the bundle, uploads it and shows you a code. The code opens it, so you pass it on yourself.</p>
      </Card>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <Button variant="ghost" size="md" onClick={onBack} disabled={busy}>Back</Button>
        <span className="flex-1" />
        <Button variant="primary" size="md" disabled={busy} onClick={onSend}>{busy ? "Sealing and uploading…" : "Share"}</Button>
      </div>
    </div>
  );
}
