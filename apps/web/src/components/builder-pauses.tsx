import type { BuilderPause } from "@rivethub/contracts";
import { useBuilderPauses, useSetBuilderPaused } from "../client/queries";
import { BUILDER_HINT, BUILDER_NAME, builderStatus } from "../lib/builderPause";
import { cx, Dot } from "./ui";

function BuilderRow({ pause }: { pause: BuilderPause }) {
  const set = useSetBuilderPaused();
  const name = BUILDER_NAME[pause.role];
  return (
    <div className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span>{name}</span>
          <span className="text-[12px] leading-[1.45] text-muted-foreground">{BUILDER_HINT[pause.role]}</span>
          <span className="flex items-center gap-1.5 text-[12px]" style={{ color: pause.paused ? "var(--warning)" : "var(--success)" }}>
            <Dot color={pause.paused ? "var(--warning)" : "var(--success)"} size={7} />
            {builderStatus(pause)}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label={name}
          checked={!pause.paused}
          disabled={set.isPending}
          onChange={(e) => set.mutate({ role: pause.role, paused: !e.target.checked })}
          className="size-5 accent-primary"
        />
      </label>
      {set.isError && (
        <p role="alert" className="m-0 text-[12px] text-error">
          Could not {pause.paused ? "resume" : "pause"} the {name.toLowerCase()}. {set.error instanceof Error ? set.error.message : ""}
        </p>
      )}
    </div>
  );
}

/** Owner-only. Left out when the hub has no pause routes, so the person is never offered a switch that cannot work. */
export function BuilderPauses({ phone }: { phone: boolean }) {
  const pauses = useBuilderPauses();
  if (!pauses.data || pauses.data.length === 0) return null;
  return (
    <section aria-labelledby="builders-h" className="flex flex-col gap-2">
      <h2 id="builders-h" className={cx("m-0 font-semibold", phone ? "text-[12px] text-muted-foreground" : "text-[15px]")}>{phone ? "BACKGROUND BUILDERS" : "Background builders"}</h2>
      <p className="m-0 text-[12px] text-muted-foreground">
        A paused builder finishes the job it has, then takes no more. Jobs wait and run when you switch it back on. Only workers on 0.8.17 or later pay attention to a pause.
      </p>
      <div className={cx("overflow-hidden border border-border bg-card", phone ? "rounded-[14px]" : "rounded-xl")}>
        {pauses.data.map((pause) => <BuilderRow key={pause.role} pause={pause} />)}
      </div>
    </section>
  );
}
