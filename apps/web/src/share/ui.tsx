import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { MainSidebar, Frame } from "../components/shell";
import { Button, cx } from "../components/ui";
import { signInWithCode } from "../client/auth";
import { desktopBridge } from "../lib/desktop";
import { useShareClient } from "../client/context";
import type { Failure } from "./failure";

/** A Share or Receive screen: the app frame, a title and, when the flow has steps, where the person is in them. */
export function ShareScreen({ title, lead, steps, current, children }: { title: string; lead: string; steps?: readonly string[]; current?: number; children: ReactNode }) {
  const share = useShareClient();
  return (
    <Frame sidebar={<MainSidebar />}>
      <div className="flex justify-center p-7">
        <div className="flex min-w-0 max-w-[960px] flex-1 flex-col gap-5">
          <header className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[22px] font-semibold">{title}</h1>
            <p className="m-0 text-muted-foreground">{lead}</p>
            {steps && share && (
              <ol aria-label="Steps" className="m-0 mt-1 flex list-none flex-wrap gap-2 p-0 text-[12px]">
                {steps.map((label, i) => (
                  <li key={label} aria-current={i === current ? "step" : undefined} className={cx("rounded-full px-2.5 py-[3px]", i === current ? "bg-selected text-foreground" : "border border-border text-muted-foreground")}>
                    {i + 1} · {label}
                  </li>
                ))}
              </ol>
            )}
          </header>
          {share ? children : <Unavailable />}
        </div>
      </div>
    </Frame>
  );
}

function Unavailable() {
  const desktop = desktopBridge() !== null;
  return (
    <div role="status" className="rounded-xl border border-dashed border-input p-5">
      <p className="m-0 text-foreground">{desktop ? "This hub can't share from here." : "Sharing is in the RivetHub desktop app."}</p>
      <p className="m-0 mt-1.5 text-[13px] text-muted-foreground">
        {desktop
          ? "This window isn't connected to your local rh node, so there is nothing to share from."
          : "A share code opens everything it holds, so it is made and received only where your own node and sign-in are. Open the desktop app on the machine your rh runs on."}
      </p>
      <p className="m-0 mt-3"><Link to="/">Back to Today</Link></p>
    </div>
  );
}

/** What went wrong, in a sentence, with a way back. A step-up failure carries the sign-in button, and signing in again changes nothing else on the screen. */
export function FailureNote({ failure, onDismiss }: { failure: Failure; onDismiss?: () => void }) {
  const [signedIn, setSignedIn] = useState(false);
  if (signedIn) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3.5">
        <p className="m-0 text-[13px] text-foreground">Signed in again. Your place is kept; try that again.</p>
        {onDismiss && <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>}
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-xl border border-error/40 p-3.5">
      <p className="m-0 font-medium text-error">{failure.title}</p>
      {failure.detail && <p className="m-0 text-[13px] text-foreground">{failure.detail}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {failure.reauth && <ReloginButton onSignedIn={() => setSignedIn(true)} />}
        {onDismiss && <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>}
      </div>
    </div>
  );
}

/** Main mints a one-time login code; this page trades it for a fresh session in place. The owner token never reaches the renderer. */
export function ReloginButton({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const bridge = desktopBridge();
  if (!bridge) return null;
  const signInAgain = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const code = await bridge.relogin();
      if (code === null) throw new Error("no login code");
      await signInWithCode(code);
      onSignedIn();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="primary" disabled={busy} onClick={() => void signInAgain()}>Sign in again</Button>
      {failed && <p className="m-0 self-center text-[13px] text-error">Couldn't sign in again. Run `rh open`, or check that rh is running.</p>}
    </>
  );
}

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cx("flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4", className)}>
      {title && <h2 className="m-0 text-[14px] font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export const field = "min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-primary";

/** Text from rh with hidden characters already written as <U+XXXX>. React escapes it; it is never HTML. */
export function Excerpt({ text, label }: { text: string; label?: string }) {
  return (
    <pre aria-label={label} className="m-0 max-h-40 overflow-auto rounded-lg bg-code p-2.5 font-mono text-[12px] leading-[1.5] break-words whitespace-pre-wrap">
      {text}
    </pre>
  );
}
