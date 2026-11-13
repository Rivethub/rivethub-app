import { Link } from "@tanstack/react-router";
import { setGuideHidden, STAGES, useJourney } from "../lib/journey";
import { CheckIcon } from "./icons";
import { Button, cx } from "./ui";

/** A thin bar: how far along the guide the person is. */
function Progress({ done, total, className }: { done: number; total: number; className?: string }) {
  return (
    <span role="progressbar" aria-label="Guide progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className={cx("block h-1 overflow-hidden rounded-full bg-input", className)}>
      <span className="block h-full rounded-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
    </span>
  );
}

/** Today's single next step. Hides for good when the guide is finished, and until asked back when dismissed. */
export function NextStep({ phone }: { phone?: boolean }) {
  const j = useJourney();
  if (!j.ready || j.finished || j.hidden || !j.next) return null;
  return (
    <section aria-labelledby="next-step" className={cx("flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-border bg-card", phone ? "p-3.5" : "px-4 py-3.5")}>
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <span className="text-[12px] font-semibold text-primary">
          Next step · {j.stage.title} <span className="font-normal text-muted-foreground">· {j.doneCount} of {j.steps.length} done</span>
        </span>
        <h2 id="next-step" className="m-0 text-[15px] font-semibold">{j.next.title}</h2>
        <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">{j.next.why}</p>
        <Progress done={j.doneCount} total={j.steps.length} className="mt-1.5 max-w-[260px]" />
      </div>
      <div className="flex items-center gap-2">
        <Link to={j.next.action.to} className={cx("rounded-lg bg-primary font-medium text-primary-foreground hover:no-underline", phone ? "flex min-h-11 items-center px-4 text-[14px]" : "px-3 py-1.5 text-[13px]")}>
          {j.next.action.label}
        </Link>
        <Link to="/guide" className="px-1.5 text-[13px]">All steps</Link>
        <Button variant="ghost" size="xs" aria-label="Hide the guide on Today" onClick={() => setGuideHidden(true)}>Hide</Button>
      </div>
    </section>
  );
}

/** The sidebar's way into the guide. Gone once every step is done. */
export function GuideRow() {
  const j = useJourney();
  if (!j.ready || j.finished) return null;
  return (
    <Link to="/guide" className="flex flex-col gap-1.5 rounded-lg px-2.5 py-2 text-foreground hover:bg-accent hover:no-underline">
      <span className="flex justify-between text-[13px]">
        <span>Guide</span>
        <span className="text-[12px] text-muted-foreground">{j.doneCount} of {j.steps.length}</span>
      </span>
      <Progress done={j.doneCount} total={j.steps.length} />
    </Link>
  );
}

const SHORTCUTS: { keys: string[]; does: string; where: string }[] = [
  { keys: ["Ctrl", "K"], does: "Search, go to anything, or run an action", where: "Everywhere" },
  { keys: ["/"], does: "Open Search", where: "Everywhere" },
  { keys: ["J", "K"], does: "Move down and up", where: "Review, Sessions" },
  { keys: ["Enter"], does: "Open the selected session", where: "Sessions" },
  { keys: ["A"], does: "Accept, or take the newer value", where: "Review" },
  { keys: ["R"], does: "Reject", where: "Review" },
  { keys: ["E"], does: "Write your own version", where: "Review" },
  { keys: ["Shift", "A"], does: "Accept the whole group", where: "Review" },
];

/** Every step, grouped by what it gets you, with the shortcuts an experienced person uses. */
export function GuideSteps() {
  const j = useJourney();
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted-foreground">
          {j.finished ? "You have done every step. The rest is using it." : `${j.doneCount} of ${j.steps.length} done. Do them in any order; each one stands on its own.`}
        </span>
        <Progress done={j.doneCount} total={j.steps.length} className="max-w-[360px]" />
        {j.hidden && !j.finished && (
          <span className="text-[13px] text-muted-foreground">
            The next step is hidden on Today. <button type="button" className="border-0 bg-transparent p-0 text-info hover:underline" onClick={() => setGuideHidden(false)}>Show it again</button>
          </span>
        )}
      </div>
      {STAGES.map((stage, n) => (
        <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <h2 id={`stage-${stage.id}`} className="m-0 text-[15px] font-semibold">
              <span className="text-muted-foreground">{n + 1}.</span> {stage.title}
            </h2>
            <span className="text-[13px] text-muted-foreground">{stage.gain}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {j.steps.filter((s) => s.stage === stage.id).map((s) => (
              <li key={s.id} className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-3", s.done ? "border-border" : s.id === j.next?.id ? "border-primary bg-card" : "border-border bg-card")}>
                <span
                  aria-hidden="true"
                  className={cx("flex size-[22px] shrink-0 items-center justify-center rounded-full", s.done ? "bg-primary text-primary-foreground" : "border border-input")}
                >
                  {s.done && <CheckIcon size={13} strokeWidth={3} />}
                </span>
                <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                  <span className={cx("font-medium", s.done && "text-muted-foreground")}>
                    {s.title}
                    <span className="sr-only">{s.done ? ", done" : ", not done yet"}</span>
                  </span>
                  <span className="text-[13px] leading-[1.5] text-muted-foreground">{s.why}</span>
                </span>
                {!s.done && <Link to={s.action.to} className="rounded-lg border border-border px-2.5 py-1 text-[13px] text-foreground hover:bg-accent hover:no-underline">{s.action.label}</Link>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="shortcuts" className="flex flex-col gap-2.5">
        <h2 id="shortcuts" className="m-0 text-[15px] font-semibold">Shortcuts</h2>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys.join("+") + s.where} className="border-b border-border">
                <td className="w-[120px] py-2 pr-3">{s.keys.map((k) => <kbd key={k} className="mr-1">{k}</kbd>)}</td>
                <td className="py-2 pr-3">{s.does}</td>
                <td className="py-2 text-right text-muted-foreground">{s.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
