import { DeviceApproval } from "../components/device-login";
import type { Account } from "@rivethub/contracts";
import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useAccount, useCapabilities, useUpdateAccount } from "../client/queries";
import { Logo } from "../components/shell";
import { Button, cx, ErrorNote, SampleBadge } from "../components/ui";
import { useDeviceSignIn } from "../lib/signin";
import { Connections } from "./settings";

const DONE_KEY = "rivethub.welcomed";

function welcomed(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true;
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    // the welcome screen shows again next visit
  }
}

/** Sends a live hub's first visit in this browser to the welcome screen. */
export function FirstRunGate() {
  const caps = useCapabilities().data;
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (caps?.account !== "live" || path === "/welcome" || welcomed()) return null;
  return <Navigate to="/welcome" replace />;
}

const STEPS = ["Updates and privacy", "Connect harnesses", "First memory"] as const;

export function WelcomePage() {
  const [step, setStep] = useState(0);
  return (
    <div className="flex min-h-dvh justify-center overflow-y-auto bg-background px-6 py-16 text-foreground">
      <div className="flex w-full max-w-[880px] flex-col gap-7">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <Logo size={40} />
          <h1 className="m-0 font-serif text-[34px] font-semibold">Welcome to RivetHub</h1>
          <span className="max-w-[560px] leading-[1.5] text-muted-foreground">
            Memory for every agent you use. Two quick choices, then we'll find your harnesses. You can change both later in Settings.
          </span>
          <ol aria-label="Steps" className="mt-1.5 flex list-none flex-wrap justify-center gap-2 p-0 text-[12px]">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? "step" : undefined} className={cx("rounded-full px-2.5 py-[3px]", i === step ? "bg-selected text-foreground" : "border border-border text-muted-foreground")}>
                {i + 1} · {s}
              </li>
            ))}
          </ol>
          <SampleBadge capability="account" />
        </div>
        {step === 0 && <Choices onNext={() => setStep(1)} />}
        {step === 1 && (
          <>
            <div className="flex flex-col gap-[22px]"><Connections phone={false} /></div>
            <div className="flex justify-center"><Button variant="primary" className="rounded-[10px] px-[22px] py-2.5 text-[14px] font-semibold" onClick={() => setStep(2)}>Continue</Button></div>
          </>
        )}
        {step === 2 && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="m-0 max-w-[520px] font-serif text-[18px] leading-[1.6]">You're set. Use any connected harness as usual. When a session ends, RivetHub summarizes it, files it, and shows what it learned on Today. Today also shows one next step at a time, for when you want more out of it.</p>
            <Link to="/" onClick={markWelcomed} className="rounded-[10px] bg-primary px-[22px] py-2.5 font-semibold text-primary-foreground hover:no-underline">Open Today</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Choices({ onNext }: { onNext: () => void }) {
  const update = useUpdateAccount();
  const signedInAs = useAccount().data?.email;
  const [source, setSource] = useState<Account["updateSource"]>("rivethub-cloud");
  const [reports, setReports] = useState(true);
  const needsEmail = source === "rivethub-cloud" && !signedInAs;
  const canContinue = true;

  function finish() {
    update.mutate({ updateSource: source, crashReports: reports, usageCounts: reports });
    onNext();
  }
  const signIn = useDeviceSignIn(finish);
  const waiting = signIn.state.phase === "waiting" || signIn.state.phase === "starting";

  function next() {
    if (needsEmail) void signIn.start();
    else finish();
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
        <section aria-labelledby="updates-q" className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h2 id="updates-q" className="m-0 text-[16px] font-semibold">How do you want updates?</h2>
            <span className="text-[13px] text-muted-foreground">Both are free and get every feature.</span>
          </div>
          <label
            className={cx("flex cursor-pointer gap-3 rounded-[10px] p-3", source === "rivethub-cloud" ? "border-2 border-primary" : "border border-border")}
            style={source === "rivethub-cloud" ? { background: "color-mix(in srgb, var(--primary) 8%, transparent)" } : undefined}
          >
            <input type="radio" name="updates" disabled={waiting} checked={source === "rivethub-cloud"} onChange={() => setSource("rivethub-cloud")} className="mt-[3px] accent-primary" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="font-medium">From the RivetHub server, with an account</span>
              <span className="text-[13px] leading-[1.45] text-muted-foreground">Approve this node in your browser using your RivetHub account. You get signed updates as we release them, and Beta if you want it.</span>
              {source === "rivethub-cloud" && signedInAs && <span className="text-[13px]">Signed in as {signedInAs}.</span>}

            </span>
          </label>
          <label className={cx("flex cursor-pointer gap-3 rounded-[10px] p-3", source === "github" ? "border-2 border-primary" : "border border-border")}>
            <input type="radio" name="updates" checked={source === "github"} onChange={() => { signIn.cancel(); setSource("github"); }} className="mt-[3px] accent-primary" />
            <span className="flex flex-1 flex-col gap-1">
              <span className="font-medium">From GitHub, no account</span>
              <span className="text-[13px] leading-[1.45] text-muted-foreground">RivetHub checks the public releases and verifies each one's signature. Or build from the repo yourself.</span>
            </span>
          </label>
          <DeviceApproval state={signIn.state} />
        </section>
        <section aria-labelledby="crash-q" className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <h2 id="crash-q" className="m-0 text-[16px] font-semibold">Help fix crashes</h2>
              <span className="text-[13px] leading-[1.45] text-muted-foreground">Send crash reports and anonymous usage counts. Your memory never leaves your hub.</span>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <span className="sr-only">Send crash reports</span>
              <input type="checkbox" role="switch" checked={reports} onChange={(e) => setReports(e.target.checked)} className="size-5 accent-primary" />
              {reports ? "On" : "Off"}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="flex flex-col gap-1.5 rounded-[10px] bg-background p-3">
              <span className="text-[12px] font-semibold text-success">SENT</span>
              <span>Crash stack trace</span><span>rh version and OS</span><span>Which job failed</span><span>Counts like "12 sessions captured"</span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-[10px] bg-background p-3">
              <span className="text-[12px] font-semibold text-error">NEVER SENT</span>
              <span>Session text or summaries</span><span>Topic or entity names</span><span>File paths or tokens</span><span>Your email</span>
            </div>
          </div>
          <Link to="/settings/$section" params={{ section: "account" }} className="text-[13px]">See an example report</Link>
        </section>
      </div>
      {signIn.state.phase === "failed" && <ErrorNote error={signIn.state.error} />}
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button variant="primary" disabled={!canContinue || waiting} onClick={next} className="rounded-[10px] px-[22px] py-2.5 text-[14px] font-semibold">
          {needsEmail ? "Sign in with your RivetHub account" : "Continue"}
        </Button>
        <Button onClick={() => { signIn.cancel(); update.mutate({ updateSource: "github", crashReports: reports, usageCounts: reports }); onNext(); }}>Continue with GitHub</Button>
        {waiting && <Button onClick={signIn.cancel} className="rounded-[10px] px-[22px] py-2.5 text-[14px]">Cancel</Button>}
      </div>
    </>
  );
}
