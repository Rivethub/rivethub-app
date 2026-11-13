import type { DraftReport } from "@rivethub/contracts";
import { getRouteApi } from "@tanstack/react-router";
import type { SessionId } from "@rivethub/contracts";
import { useEffect, useReducer, useState } from "react";
import { useShareClient } from "../client/context";
import { useSession, useTranscript } from "../client/queries";
import { Button, Loading } from "../components/ui";
import { markStep } from "../lib/journey";
import { Choose, type ShareSeed } from "../share/choose";
import { Confirm } from "../share/confirm";
import { Decide } from "../share/decide";
import { Destination } from "../share/destination";
import { Done } from "../share/done";
import { describeFailure } from "../share/failure";
import { Review } from "../share/review";
import { chosenSessions, confirmCounts, initialSend, sendReducer, type SendStep } from "../share/sendModel";
import { Card, FailureNote, ShareScreen } from "../share/ui";

const STEPS = ["Choose", "Decide", "Review flags", "Destination", "Confirm", "Share code"] as const;
const AT: Record<SendStep, number> = { choose: 0, decide: 1, sanitizing: 1, review: 2, destination: 3, confirm: 4, sending: 4, shared: 5 };

/** Only the draft's id survives a reload or a closed window, so the person can pick the draft back up. rh keeps the draft; its text never reaches storage. */
const DRAFT_KEY = "rivethub.share.draft";
const storedDraft = () => {
  try {
    return window.sessionStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
};
const storeDraft = (id: string | null) => {
  try {
    if (id === null) window.sessionStorage.removeItem(DRAFT_KEY);
    else window.sessionStorage.setItem(DRAFT_KEY, id);
  } catch {
    // storage is only a convenience
  }
};

const route = getRouteApi("/share");

/**
 * What to search for to find one session again in the share search, which matches on text.
 * A titled session is found by its title; an untitled one by its gist or its first message.
 */
function useSeed(id: string | undefined): { seed?: ShareSeed; pending: boolean } {
  const session = useSession((id ?? "") as SessionId, id !== undefined);
  const untitled = session.data?.title === "Untitled session";
  const transcript = useTranscript((id ?? "") as SessionId, id !== undefined && untitled && !session.data?.gist);
  if (id === undefined || session.isError) return { pending: false };
  if (session.isPending) return { pending: true };
  const d = session.data;
  const firstMessage = transcript.data?.find((t) => t.role === "user")?.parts.find((p) => p.kind === "text");
  if (untitled && !d.gist && transcript.isPending) return { pending: true };
  const text = (untitled ? (d.gist ?? (firstMessage?.kind === "text" ? firstMessage.text : "")) : d.title).replace(/\s+/g, " ").trim().slice(0, 80);
  return text ? { seed: { text, agent: d.harness, startedAt: d.startedAt }, pending: false } : { pending: false };
}

export function SharePage() {
  const share = useShareClient();
  const { session: from } = route.useSearch();
  const { seed, pending: seeding } = useSeed(share ? from : undefined);
  const [state, dispatch] = useReducer(sendReducer, initialSend);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resumable, setResumable] = useState<DraftReport | null>(null);
  const failed = (error: unknown) => dispatch({ type: "fail", failure: describeFailure(error, "send") });

  useEffect(() => {
    const id = storedDraft();
    if (!share || id === null) return;
    let live = true;
    share.draft(id).then(
      (report) => live && setResumable(report),
      () => storeDraft(null),
    );
    return () => {
      live = false;
    };
  }, [share]);

  if (!share) return <ShareScreen title="Share sessions" lead="Pick sessions, decide what happens to each, and get a one-time code to send privately."><span /></ShareScreen>;

  const discard = (id: string) => {
    storeDraft(null);
    setResumable(null);
    void share.discard(id).catch(() => {});
  };

  const sanitize = () => {
    dispatch({ type: "sanitize" });
    share.createDraft(chosenSessions(state.rows), { decide: state.decide }).then((report) => {
      storeDraft(report.draft);
      setResumable(null);
      dispatch({ type: "drafted", report });
    }, failed);
  };

  const apply = (marks: Parameters<typeof share.mark>[1]) => {
    if (!state.report) return;
    setBusy(true);
    share
      .mark(state.report.draft, marks)
      .then((result) => {
        dispatch({ type: "report", report: result.report });
        setNotice([result.learned, result.rechecked.length ? `Rechecked: ${result.rechecked.join(", ")}.` : null].filter(Boolean).join(" ") || null);
      }, failed)
      .finally(() => setBusy(false));
  };

  const send = () => {
    const { report, server } = state;
    if (!report || server === undefined) return;
    dispatch({ type: "sending" });
    share.send(report.draft, { server, signed: state.signed, confirm: confirmCounts(report) }).then((sent) => {
      storeDraft(null);
      markStep("share");
      dispatch({ type: "sent", sent });
    }, failed);
  };

  return (
    <ShareScreen title="Share sessions" lead="Pick sessions, decide what happens to each, and get a one-time code to send privately." steps={STEPS} current={AT[state.step]}>
      {state.failure && <FailureNote failure={state.failure} onDismiss={() => dispatch({ type: "dismiss" })} />}
      {notice && state.step === "review" && <p role="status" className="m-0 text-[13px] text-muted-foreground">{notice}</p>}

      {state.step === "choose" && resumable && (
        <Card title="You have an unfinished draft">
          <p className="m-0 text-[13px]">
            {resumable.sessions.length} {resumable.sessions.length === 1 ? "session" : "sessions"}, {resumable.flags.filter((f) => f.state.kind === "open").length} flags open. rh keeps it for 30 minutes without activity.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => { dispatch({ type: "resumed", report: resumable }); setResumable(null); }}>Resume it</Button>
            <Button variant="ghost" onClick={() => discard(resumable.draft)}>Discard it</Button>
          </div>
        </Card>
      )}
      {state.step === "choose" && seeding && <Loading label="Finding that session" />}
      {state.step === "choose" && !seeding && <Choose picked={state.picked} onToggle={(session) => dispatch({ type: "toggle", session })} onContinue={() => dispatch({ type: "to-decide" })} {...(seed ? { seed } : {})} />}
      {(state.step === "decide" || state.step === "sanitizing") && (
        <Decide rows={state.rows} decide={state.decide} busy={state.step === "sanitizing"} onDecideModel={(on) => dispatch({ type: "decide-model", on })} onChoose={(id, choice) => dispatch({ type: "decide", id, choice })} onConfirm={sanitize} onBack={() => dispatch({ type: "back" })} />
      )}
      {state.step === "review" && state.report && (
        <Review
          key={state.report.draft}
          report={state.report}
          busy={busy}
          onApply={apply}
          onContinue={() => dispatch({ type: "to-destination" })}
          onDiscard={() => {
            discard(state.report!.draft);
            dispatch({ type: "reset" });
          }}
        />
      )}
      {state.step === "destination" && (
        <Destination server={state.server} signed={state.signed} onServer={(origin) => dispatch({ type: "server", origin })} onSigned={(signed) => dispatch({ type: "signed", signed })} onContinue={() => dispatch({ type: "to-confirm" })} onBack={() => dispatch({ type: "back" })} />
      )}
      {(state.step === "confirm" || state.step === "sending") && state.report && state.server !== undefined && (
        <Confirm report={state.report} server={state.server} signed={state.signed} busy={state.step === "sending"} onSend={send} onBack={() => dispatch({ type: "back" })} />
      )}
      {state.step === "shared" && state.sent && <Done sent={state.sent} onDone={() => dispatch({ type: "reset" })} />}
    </ShareScreen>
  );
}
