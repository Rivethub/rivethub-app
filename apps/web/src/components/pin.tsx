import type { SubjectRef } from "@rivethub/contracts";
import { useClient } from "../client/context";
import { usePins, useSetPinned } from "../client/queries";
import { PinIcon } from "./icons";
import { cx } from "./ui";

/** Pins an article to the sidebar. Hidden when the client cannot store pins. */
export function PinButton({ subject, className }: { subject: SubjectRef; className?: string }) {
  const client = useClient();
  const pins = usePins().data;
  const setPinned = useSetPinned();
  if (!client.setPinned || !pins) return null;
  const pinned = pins.some((p) => p.id === subject.id);
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${subject.title}` : `Pin ${subject.title} to the sidebar`}
      title={pinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
      onClick={() => setPinned.mutate({ ref: subject, pinned: !pinned })}
      className={cx("flex size-8 items-center justify-center rounded-lg", pinned ? "text-primary" : "text-muted-foreground hover:text-foreground", className)}
    >
      <PinIcon size={15} />
    </button>
  );
}
