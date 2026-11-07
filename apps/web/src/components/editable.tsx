import { useState, type ReactNode } from "react";
import { cx } from "./ui";

/** A value that turns into an input when clicked. Enter or blur saves, Escape cancels. */
export function EditableText({
  value,
  label,
  onSave,
  mono,
  placeholder = "Add",
  display,
  className,
}: {
  value: string;
  label: string;
  onSave: (next: string) => void;
  mono?: boolean;
  placeholder?: string;
  display?: ReactNode;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <button
        type="button"
        aria-label={`${label}: ${value || "empty"}. Click to edit`}
        onClick={() => setDraft(value)}
        className={cx("-mx-1 rounded-md px-1 text-left text-foreground hover:bg-accent hover:outline hover:outline-dashed hover:outline-input", mono && "font-mono text-[12px]", !value && "text-muted-foreground", className)}
      >
        {display ?? (value || placeholder)}
      </button>
    );
  }
  const commit = () => {
    const next = draft.trim();
    setDraft(null);
    if (next !== value) onSave(next);
  };
  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      className={cx("w-full min-w-0 rounded-md border border-input bg-background px-1.5 py-0.5 text-foreground outline-none focus:border-primary", mono && "font-mono text-[12px]", className)}
    />
  );
}
