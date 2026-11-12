import type { DraftFlag, DraftReport } from "@rivethub/contracts";
import { useState } from "react";
import { Button, cx } from "../components/ui";
import { openFlags, pendingMarks, type FlagPick } from "./sendModel";
import { Card, Excerpt, field } from "./ui";

type Kind = "keep" | "redact" | "map";
interface Edit {
  kind: Kind;
  term: string;
  placeholder: string;
  learn: boolean;
}

const KINDS: { kind: Kind; label: string; hint: string }[] = [
  { kind: "keep", label: "Keep", hint: "Share this text as it is." },
  { kind: "redact", label: "Redact", hint: "Replace it with a redaction marker." },
  { kind: "map", label: "Map", hint: "Replace it with a placeholder you choose, the same everywhere." },
];

/** A flag's edit becomes a pick only when it is complete. */
function toPick(edit: Edit | undefined): FlagPick | undefined {
  if (!edit) return undefined;
  if (edit.kind !== "map") return { choice: { kind: edit.kind } };
  const term = edit.term.trim();
  const placeholder = edit.placeholder.trim();
  return term && placeholder ? { choice: { kind: "map", term, placeholder }, learn: edit.learn } : undefined;
}

/** Step 3: the report, then every flag the scan could not settle. Each needs a choice before the bundle can leave. */
export function Review({ report, busy, onApply, onContinue, onDiscard }: { report: DraftReport; busy: boolean; onApply: (marks: ReturnType<typeof pendingMarks>) => void; onContinue: () => void; onDiscard: () => void }) {
  const [edits, setEdits] = useState<Record<number, Edit | undefined>>({});
  const flags = [...report.flags].sort((a, b) => b.score - a.score);
  const picks = Object.fromEntries(Object.entries(edits).map(([n, e]) => [Number(n), toPick(e)]));
  const marks = pendingMarks(report, picks);
  const open = openFlags(report);
  const edit = (n: number, patch: Partial<Edit>, from: DraftFlag) =>
    setEdits((prev) => ({ ...prev, [n]: { ...startingEdit(from), ...prev[n], ...patch } }));
  return (
    <div className="flex flex-col gap-4">
      <ReportSummary report={report} />

      <Card title={report.flags.length === 0 ? "No flags" : `Flags (${report.flags.length}, highest score first)`}>
        {report.flags.length === 0 ? (
          <p className="m-0 text-muted-foreground">The scan found nothing it couldn't settle. You can go on.</p>
        ) : (
          <>
            <p aria-live="polite" className="m-0 text-[13px] text-muted-foreground">
              {open === 0 ? "Every flag has a choice." : `${open} ${open === 1 ? "flag is" : "flags are"} still open.`} Flagged text is shown with hidden characters written as &lt;U+XXXX&gt;.
            </p>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {flags.map((flag) => (
                <FlagCard key={flag.number} flag={flag} edit={edits[flag.number]} onEdit={(patch) => edit(flag.number, patch, flag)} />
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <Button variant="ghost" size="md" onClick={onDiscard}>Discard draft</Button>
        <span className="flex-1" />
        {marks.length > 0 && (
          <Button size="md" disabled={busy} onClick={() => onApply(marks)}>{busy ? "Applying…" : `Apply ${marks.length} ${marks.length === 1 ? "choice" : "choices"}`}</Button>
        )}
        <Button variant="primary" size="md" disabled={open > 0 || marks.length > 0 || busy} onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}

function startingEdit(flag: DraftFlag): Edit {
  const state = flag.state;
  return {
    kind: state.kind === "keep" || state.kind === "redact" || state.kind === "map" ? state.kind : "keep",
    term: state.kind === "map" ? state.term : flag.text.length <= 80 ? flag.text : "",
    placeholder: state.kind === "map" ? state.placeholder : "",
    learn: false,
  };
}

function ReportSummary({ report }: { report: DraftReport }) {
  const t = report.totals;
  const parts = [`${t.secrets} secrets removed`, `${t.redacted} redactions`, `${t.mapped} terms mapped`, `${t.escaped} characters escaped`];
  return (
    <Card title="What the scan did">
      <p className="m-0">{parts.join(" · ")}</p>
      {report.rules.length > 0 && (
        <ul aria-label="Changes by rule" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {report.rules.map((r) => (
            <li key={r.rule} className="rounded-md border border-border px-2 py-0.5 font-mono text-[12px]">{r.rule} ×{r.count}</li>
          ))}
        </ul>
      )}
      <p className="m-0 text-[13px] text-muted-foreground">{report.sessions.length} {report.sessions.length === 1 ? "session" : "sessions"} in this draft.</p>
      <p className="m-0 text-[13px]">{report.bestEffort}</p>
      <p className="m-0 text-[13px] text-muted-foreground">{report.notScanned}</p>
    </Card>
  );
}

function FlagCard({ flag, edit, onEdit }: { flag: DraftFlag; edit: Edit | undefined; onEdit: (patch: Partial<Edit>) => void }) {
  const shown: Edit | undefined = edit ?? (flag.state.kind === "open" ? undefined : startingEdit(flag));
  const place = flag.place;
  const where = place ? `session ${place.session + 1} · ${place.field}${place.message === undefined ? "" : ` · message ${place.message + 1}`}${place.more > 0 ? ` · +${place.more} more` : ""}` : "unplaced";
  const name = `Flag ${flag.number}`;
  return (
    <li aria-label={name} className={cx("flex flex-col gap-2 rounded-xl border p-3", shown ? "border-border" : "border-warning/60")}>
      <div className="flex flex-wrap items-baseline gap-x-3 text-[12px] text-muted-foreground">
        <span className="font-semibold text-foreground">{name}</span>
        <span>{where}</span>
        <span>score {flag.score.toFixed(2)}</span>
        <span>{flag.length} characters</span>
      </div>
      <Excerpt text={flag.text} label={`Flagged text of ${name}`} />
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
        <legend className="sr-only">Choice for {name}</legend>
        {KINDS.map((k) => (
          <label key={k.kind} title={k.hint} className="cursor-pointer">
            <input type="radio" name={`flag-${flag.number}`} checked={shown?.kind === k.kind} onChange={() => onEdit({ kind: k.kind })} className="peer sr-only" />
            <span
              className={cx(
                "block rounded-lg border px-3 py-1 text-[13px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
                shown?.kind === k.kind ? "border-primary tint-primary text-foreground" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {k.label}
            </span>
          </label>
        ))}
      </fieldset>
      {shown?.kind === "map" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[12px]">
            Term to replace
            <input value={shown.term} onChange={(e) => onEdit({ term: e.target.value })} className={`${field} font-mono`} />
          </label>
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[12px]">
            Placeholder
            <input value={shown.placeholder} onChange={(e) => onEdit({ placeholder: e.target.value })} placeholder="PERSON_1" className={`${field} font-mono`} />
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[12px]">
            <input type="checkbox" checked={shown.learn} onChange={(e) => onEdit({ learn: e.target.checked })} className="accent-primary" />
            Remember this mapping
          </label>
          {(!shown.term.trim() || !shown.placeholder.trim()) && <p className="m-0 basis-full text-[12px] text-warning">Fill in both the term and the placeholder.</p>}
        </div>
      )}
    </li>
  );
}
