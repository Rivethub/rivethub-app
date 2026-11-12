import type { SharedBundle } from "@rivethub/contracts";
import { useState } from "react";
import { Button } from "../components/ui";
import { Card } from "./ui";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The last step. The code shows here and nowhere else, and leaving the screen drops it. */
export function Done({ sent, onDone }: { sent: SharedBundle; onDone: () => void }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Card title="Your share code">
        <p className="m-0 text-[13px] text-muted-foreground">This is the only time it is shown. RivetHub keeps no copy.</p>
        <output aria-label="Share code" className="block rounded-lg border border-input bg-code p-3 font-mono text-[14px] leading-[1.5] break-all select-all">{sent.code}</output>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              navigator.clipboard.writeText(sent.code).then(
                () => setCopied("yes"),
                () => setCopied("failed"),
              );
            }}
          >
            Copy code
          </Button>
          <span role="status" className="text-[13px] text-muted-foreground">
            {copied === "yes" && "Copied. Paste it into a private message, then clear your clipboard."}
            {copied === "failed" && "Couldn't copy. Select the code above and copy it yourself."}
          </span>
        </div>
      </Card>
      <Card title="Send this privately">
        <p className="m-0">Send it in person or in an end-to-end encrypted chat. Anyone who has it can read these sessions once.</p>
        <p className="m-0 text-[13px] text-muted-foreground">
          It works once and expires on {when(sent.expiresAt)}. Don't post it in a channel, an issue or an email. {sent.bytes.toLocaleString()} bytes uploaded{sent.signed ? `, signed as ${sent.signed}` : ", unsigned"}.
        </p>
      </Card>
      <div>
        <Button size="md" onClick={onDone}>Done, remove the code from this screen</Button>
      </div>
    </div>
  );
}
