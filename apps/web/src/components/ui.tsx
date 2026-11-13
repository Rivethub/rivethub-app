import type { Capability, TagAssignment } from "@rivethub/contracts";
import { Link } from "@tanstack/react-router";
import { Fragment, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useIsSample } from "../client/queries";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function SampleBadge({ capability }: { capability: Capability }) {
  if (!useIsSample(capability)) return null;
  return (
    <span
      title="This screen shows sample data, not your hub's memory."
      className="inline-flex w-fit shrink-0 items-center rounded-full border border-dashed border-input px-2 py-px font-sans text-[11px] font-medium text-muted-foreground"
    >
      Sample data
    </span>
  );
}

export function KindTag({ label, color }: { label: string; color: string }) {
  return (
    <span className="rounded px-1.5 py-px text-[11px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {label}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("text-[12px] font-semibold tracking-[0.02em] text-muted-foreground uppercase", className)}>{children}</span>;
}

type Variant = "primary" | "outline" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "border-0 bg-primary text-primary-foreground hover:brightness-110",
  outline: "border border-border bg-transparent text-foreground hover:bg-accent",
  ghost: "border-0 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
  danger: "border-0 tint-error text-error hover:brightness-110",
};

export function Button({ variant = "outline", size = "sm", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "xs" | "sm" | "md" | "lg" }) {
  const sizes = { xs: "px-2 py-0.5 text-[12px] rounded-md", sm: "px-2.5 py-1 text-[12px] rounded-lg", md: "px-3 py-1 text-[13px] rounded-lg", lg: "min-h-12 px-4 text-[15px] rounded-xl" };
  return <button type="button" className={cx("inline-flex items-center justify-center gap-1.5 transition-[filter,background-color]", variants[variant], sizes[size], className)} {...rest} />;
}

export function Chip({ children, to, dashed }: { children: ReactNode; to?: string; dashed?: boolean }) {
  const cls = cx("rounded-md border px-2 py-0.5", dashed ? "border-dashed border-input text-muted-foreground" : "border-border");
  return to ? <Link to={to} className={cls}>{children}</Link> : <span className={cls}>{children}</span>;
}

/** `project: rivethub` reads as written; a tag with no key of its own (rh files those under "tag") reads as its value. */
const tagLabel = (t: TagAssignment) => (t.key === "tag" ? t.value : `${t.key}: ${t.value}`);

export function Tags({ tags, onAccept, onReject }: { tags: TagAssignment[]; onAccept?: (t: TagAssignment) => void; onReject?: (t: TagAssignment) => void }) {
  return (
    <span className="flex flex-wrap gap-1.5 text-[12px]">
      {tags.map((t) =>
        t.state === "applied" ? (
          <span key={`${t.key}:${t.value}`} className="rounded-md border border-border px-2 py-0.5">{tagLabel(t)}</span>
        ) : (
          <span key={`${t.key}:${t.value}`} className="inline-flex items-center gap-1 rounded-md border border-dashed border-warning px-2 py-0.5 text-warning">
            {tagLabel(t)}
            {onAccept && <button type="button" aria-label={`Accept tag ${t.key}: ${t.value}`} className="px-0.5" onClick={() => onAccept(t)}>✓</button>}
            {onReject && <button type="button" aria-label={`Reject tag ${t.key}: ${t.value}`} className="px-0.5" onClick={() => onReject(t)}>✕</button>}
          </span>
        ),
      )}
    </span>
  );
}

/** Renders `[label](/app/path)` links inside plain text. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(\/[^)]*\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[([^\]]+)\]\((\/[^)]*)\)$/.exec(p);
        return m ? <Link key={i} to={m[2]!}>{m[1]}</Link> : <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <p role="status" className="p-6 text-muted-foreground">{label}…</p>;
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <p role="alert" className="m-6 rounded-lg border border-error/40 p-3 text-error">
      {error instanceof Error ? error.message : "Something went wrong."}
    </p>
  );
}
