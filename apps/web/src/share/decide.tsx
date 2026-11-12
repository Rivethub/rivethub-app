import { useState } from "react";
import { Button, cx } from "../components/ui";
import { canSanitize, tally, termProblem, type Row, type RowChoice } from "./sendModel";
import { field } from "./ui";

const OPTIONS = [
  { kind: "approve", label: "Approve", hint: "Share as is, after the automatic scan." },
  { kind: "redact", label: "Redact", hint: "Remove terms you list and, if you want, tool outputs." },
  { kind: "deny", label: "Deny", hint: "Leave this session out. It is never sent." },
] as const;

/** Step 2: one decision per session, reviewed in one table, confirmed once. Nothing is sanitized until the confirm. */
export function Decide({ rows, decide, busy, onDecideModel, onChoose, onConfirm, onBack }: { rows: Row[]; decide: boolean; busy: boolean; onDecideModel: (on: boolean) => void; onChoose: (id: string, choice: RowChoice) => void; onConfirm: () => void; onBack: () => void }) {
  const counts = tally(rows);
  return (
    <div className="flex flex-col gap-4">
      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-border bg-card text-left">
        <caption className="sr-only">Decide what happens to each session</caption>
        <thead>
          <tr className="text-[12px] text-muted-foreground">
            <th scope="col" className="p-3 font-semibold">Session</th>
            <th scope="col" className="p-3 font-semibold">Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <DecisionRow key={row.session.id} row={row} onChoose={(choice) => onChoose(row.session.id, choice)} />
          ))}
        </tbody>
      </table>

      <label className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3.5">
        <input type="checkbox" checked={decide} onChange={(e) => onDecideModel(e.target.checked)} className="mt-1 accent-primary" />
        <span className="flex flex-col">
          <span>Have my decision model take a second look</span>
          <span className="text-[12px] text-muted-foreground">It scores what the automatic scan can't settle, such as names and internal hosts, and you review the top ones before anything is sent.</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <p aria-live="polite" className="m-0 flex-1 text-[13px]">
          {counts.undecided > 0 ? (
            <span className="text-warning">{counts.undecided} still to decide.</span>
          ) : (
            <span>
              {counts.approved} approved, {counts.redacted} redacted, {counts.denied} denied. Denied sessions are never sent.
            </span>
          )}
        </p>
        <Button variant="ghost" size="md" onClick={onBack}>Back</Button>
        <Button variant="primary" size="md" disabled={!canSanitize(rows) || busy} onClick={onConfirm}>
          {busy ? "Sanitizing…" : "Confirm decisions and sanitize"}
        </Button>
      </div>
    </div>
  );
}

function DecisionRow({ row, onChoose }: { row: Row; onChoose: (choice: RowChoice) => void }) {
  const { session, choice } = row;
  const name = `Decision for ${session.title ?? "(untitled)"}`;
  return (
    <tr className="align-top">
      <th scope="row" className="min-w-0 border-t border-border p-3 text-left font-normal">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{session.title ?? "(untitled)"}</span>
          <span className="text-[12px] text-muted-foreground">{session.agent} · {session.messages} messages</span>
        </span>
      </th>
      <td className="border-t border-border p-3">
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
          <legend className="sr-only">{name}</legend>
          {OPTIONS.map((o) => {
            const on = choice.kind === o.kind;
            return (
              <label key={o.kind} title={o.hint} className="cursor-pointer">
                <input
                  type="radio"
                  name={`decision-${session.id}`}
                  checked={on}
                  onChange={() => onChoose(o.kind === "redact" ? { kind: "redact", terms: [], dropToolOutputs: false } : { kind: o.kind })}
                  className="peer sr-only"
                />
                <span
                  className={cx(
                    "block rounded-lg border px-3 py-1 text-[13px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
                    on ? (o.kind === "deny" ? "border-error tint-error text-error" : "border-primary tint-primary text-foreground") : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {o.label}
                </span>
              </label>
            );
          })}
        </fieldset>
        {choice.kind === "redact" && <RedactOptions terms={choice.terms} dropToolOutputs={choice.dropToolOutputs} label={session.title ?? "(untitled)"} onChange={(next) => onChoose({ kind: "redact", ...next })} />}
        {choice.kind === "deny" && <p className="m-0 mt-2 text-[12px] text-muted-foreground">This session stays out of the bundle.</p>}
      </td>
    </tr>
  );
}

function RedactOptions({ terms, dropToolOutputs, label, onChange }: { terms: string[]; dropToolOutputs: boolean; label: string; onChange: (next: { terms: string[]; dropToolOutputs: boolean }) => void }) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const add = () => {
    const issue = termProblem(terms, draft);
    setProblem(issue);
    if (issue) return;
    onChange({ terms: [...terms, draft.trim()], dropToolOutputs });
    setDraft("");
  };
  return (
    <div className="mt-2.5 flex flex-col gap-2 rounded-lg border border-border p-2.5">
      <ul aria-label={`Terms to redact in ${label}`} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {terms.map((t) => (
          <li key={t} className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-mono text-[12px]">
            {t}
            <button type="button" aria-label={`Remove term ${t}`} onClick={() => onChange({ terms: terms.filter((x) => x !== t), dropToolOutputs })} className="px-0.5 text-muted-foreground">✕</button>
          </li>
        ))}
        {terms.length === 0 && <li className="text-[12px] text-muted-foreground">No terms yet. Terms match exactly, including case.</li>}
      </ul>
      <div className="flex gap-1.5">
        <input
          aria-label={`Add a term to redact in ${label}`}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `term-problem-${label}` : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="A name, host or project term"
          className={`${field} flex-1`}
        />
        <Button size="sm" onClick={add}>Add term</Button>
      </div>
      {problem && <p id={`term-problem-${label}`} role="alert" className="m-0 text-[12px] text-error">{problem}</p>}
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={dropToolOutputs} onChange={(e) => onChange({ terms, dropToolOutputs: e.target.checked })} className="accent-primary" />
        Drop tool outputs
      </label>
    </div>
  );
}
