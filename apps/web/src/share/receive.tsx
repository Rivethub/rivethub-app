import type { FindingRow, InboundSession, ReceiveDecision, ReceiveReport } from "@rivethub/contracts";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { shortDate } from "@rivethub/client-runtime/format";
import { useShareClient } from "../client/context";
import { Button, cx } from "../components/ui";
import { describeFailure, type Failure } from "./failure";
import { acceptsFlagged, blocked, canImport, decisionsFor, isFlagged, undecided, verifiedLabel, type ReceiveState } from "./receiveModel";
import { Card, Excerpt, FailureNote, field } from "./ui";
import { hostOf } from "./format";

/** Step 1: paste the code. The field is masked and the code goes nowhere but rh's POST body. */
export function Paste({ code, busy, onCode, onCheck }: { code: string; busy: boolean; onCode: (code: string) => void; onCheck: () => void }) {
  const [shown, setShown] = useState(false);
  const ready = code.trim() !== "";
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onCheck();
      }}
    >
      <Card title="Share code">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Paste the code you were sent</span>
          <input
            type={shown ? "text" : "password"}
            value={code}
            onChange={(e) => onCode(e.target.value)}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="rivethub:…"
            className={`${field} min-h-10 font-mono text-[14px]`}
          />
        </label>
        <p className="m-0 text-[12px] text-muted-foreground">The code opens the bundle, so it stays on this screen only. Checking it downloads the bundle and reads it here, and imports nothing.</p>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="md" disabled={!ready || busy}>{busy ? "Downloading and checking…" : "Check the bundle"}</Button>
          <Button size="md" variant="ghost" aria-pressed={shown} onClick={() => setShown((s) => !s)}>{shown ? "Hide code" : "Show code"}</Button>
        </div>
      </Card>
    </form>
  );
}

/** Step 2: who sent it, whether that checks out, and what rh's checks found per session. */
export function Report({ state, busy, onChoose, onImport, onCancel, onTrusted }: { state: ReceiveState; busy: boolean; onChoose: (n: number, decision: ReceiveDecision) => void; onImport: () => void; onCancel: () => void; onTrusted: () => void }) {
  const report = state.report!;
  const waiting = undecided(report, state.choices);
  return (
    <div className="flex flex-col gap-4">
      <Sender report={report} onTrusted={onTrusted} />
      {report.held && (
        <p role="status" className="m-0 rounded-xl border border-warning/50 p-3 text-[13px]">
          <strong>Held.</strong> {blocked(report) ? "The sender's own details carry a finding, so this bundle can't be imported." : "Some sessions have findings. Nothing is imported until you decide each of them."}
        </p>
      )}
      <ul aria-label="Sessions in the bundle" className="m-0 flex list-none flex-col gap-2.5 p-0">
        {report.sessions.map((s) => (
          <SessionCard key={s.n} session={s} bundleAuthor={report.author} choice={state.choices[s.n]} onChoose={(d) => onChoose(s.n, d)} />
        ))}
      </ul>
      {blocked(report) && report.authorRows.length > 0 && <FindingList rows={report.authorRows} />}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <Button variant="ghost" size="md" onClick={onCancel}>Cancel</Button>
        <p aria-live="polite" className="m-0 flex-1 text-[13px] text-muted-foreground">
          {waiting.length > 0
            ? `${waiting.length} flagged ${waiting.length === 1 ? "session needs" : "sessions need"} a decision.`
            : acceptsFlagged(report, state.choices)
              ? "Importing a flagged session as it is needs a fresh sign-in."
              : report.summary}
        </p>
        <Button variant="primary" size="md" disabled={!canImport(report, state.choices) || busy} onClick={onImport}>{busy ? "Importing…" : "Import"}</Button>
      </div>
    </div>
  );
}

function Sender({ report, onTrusted }: { report: ReceiveReport; onTrusted: () => void }) {
  const verified = report.verification === "verified";
  return (
    <Card title="Where it came from">
      <p className="m-0 text-[17px]">
        from <strong>{report.author}</strong> · <span className={verified ? "text-success" : "text-warning"}>{verifiedLabel(report.verification)}</span>
      </p>
      <p className="m-0 text-[13px] text-muted-foreground">{report.reason}</p>
      <p className="m-0 text-[12px] text-muted-foreground">
        {report.downloaded ? "Downloaded" : "Reopened from this machine's inbox"} from {hostOf(report.server)}, made on {report.node}.
      </p>
      {report.signer && (
        <p className="m-0 text-[12px] text-muted-foreground">Signed with <span className="font-mono">{report.signer.fingerprint}</span></p>
      )}
      {!verified && report.signer && <TrustSender name={report.author} keyText={report.signer.key} fingerprint={report.signer.fingerprint} onTrusted={onTrusted} />}
    </Card>
  );
}

/** Trusting a key changes what later imports are called, so it asks for a fingerprint check first. */
export function TrustSender({ name, keyText, fingerprint, onTrusted }: { name: string; keyText: string; fingerprint: string; onTrusted: () => void }) {
  const share = useShareClient()!;
  const [checked, setChecked] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [done, setDone] = useState(false);
  if (done) return <p role="status" className="m-0 text-[13px] text-success">Trusted. Later bundles from {name} signed with this key arrive verified.</p>;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      {failure && <FailureNote failure={failure} onDismiss={() => setFailure(null)} />}
      <p className="m-0 text-[13px]">Trust this key for {name}? Compare <span className="font-mono">{fingerprint}</span> with what {name} sees on their side, in person or over a channel you trust.</p>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="accent-primary" />
        The fingerprint matches
      </label>
      <div>
        <Button
          size="sm"
          disabled={!checked}
          onClick={() =>
            void share.trust(name, keyText).then(
              () => {
                setDone(true);
                onTrusted();
              },
              (error: unknown) => setFailure(describeFailure(error, "receive")),
            )
          }
        >
          Trust {name}'s key
        </Button>
      </div>
    </div>
  );
}

const DECISIONS: Record<ReceiveDecision, { label: string; hint: string }> = {
  import: { label: "Import", hint: "Add the session to your memory." },
  skip: { label: "Skip", hint: "Leave this session out." },
  hold_spans: { label: "Hold spans", hint: "Import it with each finding replaced by a [HELD] marker." },
};

function SessionCard({ session, bundleAuthor, choice, onChoose }: { session: InboundSession; bundleAuthor: string; choice: ReceiveDecision | undefined; onChoose: (decision: ReceiveDecision) => void }) {
  const flagged = isFlagged(session);
  const options = decisionsFor(session);
  return (
    <li aria-label={`Session ${session.n}: ${session.title}`} className={cx("flex flex-col gap-2.5 rounded-xl border bg-card p-3.5", flagged ? "border-warning/60" : "border-border")}>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{session.title || "(untitled)"}</span>
        <span className="text-[12px] text-muted-foreground">
          {session.agent} · {session.messages} messages{session.createdAt ? ` · ${shortDate(session.createdAt)}` : ""} · by {session.author ?? bundleAuthor}
        </span>
      </div>
      {flagged ? (
        <>
          <FamilyChips rows={session.rows} findings={session.findings} />
          <FindingList rows={session.rows} />
          {session.secret && <p className="m-0 text-[12px] text-warning">A secret was found, so this session can be skipped or held, not imported as it is.</p>}
        </>
      ) : (
        <p className="m-0 text-[12px] text-success">No findings.</p>
      )}
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
        <legend className="sr-only">Decision for session {session.n}</legend>
        {options.map((d) => (
          <label key={d} title={DECISIONS[d].hint} className="cursor-pointer">
            <input type="radio" name={`receive-${session.n}`} checked={choice === d} onChange={() => onChoose(d)} className="peer sr-only" />
            <span
              className={cx(
                "block rounded-lg border px-3 py-1 text-[13px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
                choice === d ? "border-primary tint-primary text-foreground" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {DECISIONS[d].label}
            </span>
          </label>
        ))}
      </fieldset>
    </li>
  );
}

function FamilyChips({ rows, findings }: { rows: FindingRow[]; findings: number }) {
  const families = [...new Set(rows.map((r) => r.family))];
  return (
    <p className="m-0 flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className="text-warning">{findings} {findings === 1 ? "finding" : "findings"}</span>
      {families.map((family) => (
        <span key={family} className={cx("rounded-md border px-1.5 py-px font-semibold", family === "secret" ? "border-error text-error" : "border-warning text-warning")}>{family}</span>
      ))}
    </p>
  );
}

function FindingList({ rows }: { rows: FindingRow[] }) {
  return (
    <ul aria-label="Findings" className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((r, i) => (
        <li key={i} className="flex flex-col gap-1">
          <span className="text-[12px] text-muted-foreground">
            <span className="font-mono">{r.rule}</span> · {r.family} · {r.field}{r.event ? ` · event ${r.event}` : ""}{r.count > 1 ? ` · ×${r.count}` : ""}
          </span>
          <Excerpt text={r.excerpt} label={`Excerpt for ${r.rule}`} />
        </li>
      ))}
    </ul>
  );
}

/** The last step: each imported session with who it came from and whether that was verified. */
export function Imported({ state, onDone }: { state: ReceiveState; onDone: () => void }) {
  const report = state.report!;
  const result = state.result!;
  const byN = new Map(report.sessions.map((s) => [s.n, s]));
  return (
    <div className="flex flex-col gap-4">
      <Card title={`Imported ${result.imported.length} ${result.imported.length === 1 ? "session" : "sessions"}`}>
        <ul aria-label="Imported sessions" className="m-0 flex list-none flex-col gap-2 p-0">
          {result.imported.map((i) => {
            const s = byN.get(i.n);
            return (
              <li key={i.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-border p-2.5">
                <Link to="/sessions/$sessionId" params={{ sessionId: i.key }} className="font-medium">{s?.title || "(untitled)"}</Link>
                <span className="text-[13px]">
                  from {s?.author ?? result.author} · <span className={i.verification === "verified" ? "text-success" : "text-warning"}>{verifiedLabel(i.verification)}</span>
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {i.verdict === "hold_spans" ? "findings held" : i.verdict === "import" ? "imported with findings" : "clean"} · {i.inserted} messages added{i.skipped > 0 ? `, ${i.skipped} already here` : ""}
                </span>
              </li>
            );
          })}
        </ul>
        {result.skipped.length > 0 && <p className="m-0 text-[13px] text-muted-foreground">Skipped: {result.skipped.map((n) => byN.get(n)?.title || `session ${n}`).join(", ")}.</p>}
        <p className="m-0 text-[12px] text-muted-foreground">Received {new Date(result.receivedAt).toLocaleString()}. The code is no longer needed and has been removed from this screen.</p>
      </Card>
      <div><Button size="md" variant="primary" onClick={onDone}>Receive another</Button></div>
    </div>
  );
}
