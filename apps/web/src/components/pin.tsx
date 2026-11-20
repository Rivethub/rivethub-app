import type { SubjectRef } from "@rivethub/contracts";
import { useEffect, useRef } from "react";
import { useClient } from "../client/context";
import { usePins, useSetPinned } from "../client/queries";
import { PinIcon } from "./icons";
import { cx } from "./ui";

/** Pins an article to the sidebar. Hidden when the client cannot store pins. */
export function PinButton({ subject, className }: { subject: SubjectRef; className?: string }) {
  const client = useClient();
  const pins = usePins().data;
  const { mutate } = useSetPinned();
  const stored = pins?.find((pin) => pin.kind === subject.kind && pin.id === subject.id);
  const pending = useRef<string | null>(null);
  // The open page already has this title, so a rename can correct the stored pin without another request.
  useEffect(() => {
    if (!client.setPinned || !stored || stored.title === subject.title) return;
    const key = `${subject.kind}\0${subject.id}\0${subject.title}`;
    if (pending.current === key) return;
    pending.current = key;
    mutate({ ref: subject, pinned: true });
  }, [client.setPinned, stored, subject, mutate]);
  if (!client.setPinned || !pins) return null;
  const pinned = stored !== undefined;
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${subject.title}` : `Pin ${subject.title} to the sidebar`}
      title={pinned ? "Unpin from the sidebar" : "Pin to the sidebar"}
      onClick={() => mutate({ ref: subject, pinned: !pinned })}
      className={cx("flex size-8 items-center justify-center rounded-lg", pinned ? "text-primary" : "text-muted-foreground hover:text-foreground", className)}
    >
      <PinIcon size={15} />
    </button>
  );
}
