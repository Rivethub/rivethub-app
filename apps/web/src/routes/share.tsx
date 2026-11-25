import { HttpError } from "@rivethub/client";
import type { DraftReport, SessionId, ShareServer } from "@rivethub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useReducer, useState } from "react";
import { useShareClient } from "../client/context";
import { useAccount, useSession, useTranscript } from "../client/queries";
import { Button, Loading } from "../components/ui";
import { markStep } from "../lib/journey";
import { Choose, type ShareSeed } from "../share/choose";
import { Confirm } from "../share/confirm";
import { Decide } from "../share/decide";
import { cloudPolicy, Destination, listedServers, sameDestination, SERVERS_KEY, usable } from "../share/destination";
import { Done, Pushed } from "../share/done";
import { describeFailure, DESTINATION_GONE } from "../share/failure";
import { Review } from "../share/review";
import { chosenSessions, confirmCounts, initialSend, openFlags, sendReducer, type Delivery, type SendStep } from "../share/sendModel";
import { BUNDLES_KEY, Connected, ReadyBundles } from "../share/start";
import { Card, FailureNote, ShareScreen } from "../share/ui";

const LEAD = "Send a ready bundle or pick sessions, check what the scrubber flagged, and send it to a server you are connected to.";
const STEPS = ["Choose", "Decide", "Review flags", "Destination", "Confirm", "Sent"] as const;
const AT: Record<SendStep, number> = { choose: 0, opening: 0, decide: 1, sanitizing: 1, review: 2, destination: 3, confirm: 4, sending: 4, shared: 5 };

/**
 * Only the draft's id, and the bundle it came from, survive a reload or a closed window, so the person can pick
 * the draft back up. rh keeps the draft; its text never reaches storage.
 */
const DRAFT_KEY = "rivethub.share.draft";
interface StoredDraft {
  id: string;
  bundle?: string;
}
const storedDraft = (): StoredDraft | null => {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && typeof (parsed as StoredDraft).id === "string") {
        const { id, bundle } = parsed as StoredDraft;
        return typeof bundle === "string" ? { id, bundle } : { id };
      }
    } catch {
      // an id stored before the bundle was kept with it
    }
    return { id: raw };
  } catch {
    return null;
  }
};
const storeDraft = (draft: StoredDraft | null) => {
  try {
    if (draft === null) window.sessionStorage.removeItem(DRAFT_KEY);
    else window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
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
  const queryClient = useQueryClient();
  const account = useAccount();
  const { session: from } = route.useSearch();
  const { seed, pending: seeding } = useSeed(share ? from : undefined);
  const [state, dispatch] = useReducer(sendReducer, initialSend);
  const [busy, setBusy] = useState(false);
  const [resumable, setResumable] = useState<{ report: DraftReport; bundle?: string } | null>(null);
  const [unchecked, setUnchecked] = useState(false);
  const [check, setCheck] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const failed = (error: unknown) => dispatch({ type: "fail", failure: describeFailure(error, "send") });

  useEffect(() => {
    const stored = storedDraft();
    if (!share || stored === null) return;
    let live = true;
    share.draft(stored.id).then(
      (report) => {
        if (live) setResumable({ report, ...(stored.bundle === undefined ? {} : { bundle: stored.bundle }) });
      },
      (error: unknown) => {
        // Forget the id only once rh says that draft is gone, and only if a newer draft hasn't taken its place.
        if (error instanceof HttpError && error.status === 404) {
          if (storedDraft()?.id === stored.id) storeDraft(null);
        } else if (live) setUnchecked(true);
      },
    );
    return () => {
      live = false;
    };
  }, [share, check]);

  if (!share) return <ShareScreen title="Share sessions" lead={LEAD}><span /></ShareScreen>;

  const discard = (id: string) => {
    storeDraft(null);
    setResumable(null);
    setUnchecked(false);
    void share.discard(id).catch(() => {});
  };

  const drafted = (report: DraftReport, bundle?: string) => {
    storeDraft({ id: report.draft, ...(bundle === undefined ? {} : { bundle }) });
    setResumable(null);
    setUnchecked(false);
    dispatch({ type: "drafted", report, bundle });
  };

  const sanitize = () => {
    dispatch({ type: "sanitize" });
    share.createDraft(chosenSessions(state.rows), { decide: state.decide }).then((report) => drafted(report), failed);
  };

  const openBundle = (name: string) => {
    dispatch({ type: "open-bundle" });
    setOpening(name);
    share
      .draftFromBundle(name)
      .then(
        (report) => drafted(report, name),
        (error: unknown) => {
          void queryClient.invalidateQueries({ queryKey: BUNDLES_KEY });
          dispatch({ type: "fail", failure: describeFailure(error, "open-bundle") });
        },
      )
      .finally(() => setOpening(null));
  };

  const apply = (marks: Parameters<typeof share.mark>[1]) => {
    if (!state.report) return;
    setBusy(true);
    share
      .mark(state.report.draft, marks)
      .then((result) => {
        const notice = [result.learned, result.rechecked.length ? `Rechecked: ${result.rechecked.join(", ")}.` : null].filter(Boolean).join(" ");
        dispatch({ type: "report", report: result.report, notice: notice || undefined });
      }, failed)
      .finally(() => setBusy(false));
  };

  /** The server as rh lists it right now, if it is still offered and still reached the way the sender confirmed. */
  const stillListed = async (server: ShareServer): Promise<ShareServer | undefined> => {
    const fresh = await queryClient.fetchQuery({ queryKey: SERVERS_KEY, queryFn: () => share.servers(), staleTime: 0 });
    return listedServers(fresh, cloudPolicy(fresh, account)).find((s) => sameDestination(s, server) && usable(s));
  };

  const send = () => {
    const { report, server } = state;
    if (!report || server === undefined) return;
    dispatch({ type: "sending" });
    const confirm = confirmCounts(report);
    const deliver = (to: ShareServer): Promise<Delivery> =>
      to.delivery === "push"
        ? share.push(report.draft, { hub: to.hub, confirm }).then((pushed) => ({ kind: "pushed", pushed }))
        : share.send(report.draft, { server: to.origin, signed: state.signed, confirm }).then((sent) => ({ kind: "code", sent }));
    stillListed(server)
      .then((to) => {
        if (to === undefined) throw DESTINATION_GONE;
        return deliver(to);
      })
      .then(
        (delivered) => {
          storeDraft(null);
          markStep("share");
          void queryClient.invalidateQueries({ queryKey: BUNDLES_KEY });
          dispatch({ type: "delivered", delivery: delivered });
        },
        (error: unknown) => {
          const failure = error === DESTINATION_GONE ? DESTINATION_GONE : describeFailure(error, "send");
          if (failure.backTo === "destination") void queryClient.invalidateQueries({ queryKey: SERVERS_KEY });
          dispatch({ type: "fail", failure });
        },
      );
  };

  return (
    <ShareScreen title="Share sessions" lead={LEAD} steps={STEPS} current={AT[state.step]}>
      {state.failure && <FailureNote failure={state.failure} onDismiss={() => dispatch({ type: "dismiss" })} />}
      {state.notice && state.step === "review" && <p role="status" className="m-0 text-[13px] text-muted-foreground">{state.notice}</p>}
      {state.step === "choose" && unchecked && (
        <Card title="Couldn't check your unfinished draft">
          <p className="m-0 text-[13px]">rh didn't answer about the draft you were working on. It may still be there.</p>
          <div>
            <Button onClick={() => { setUnchecked(false); setCheck((n) => n + 1); }}>Try again</Button>
          </div>
        </Card>
      )}

      {state.step === "choose" && resumable && (
        <Card title="You have an unfinished draft">
          <p className="m-0 text-[13px]">
            {resumable.bundle === undefined ? "" : `${resumable.bundle}: `}
            {resumable.report.sessions.length} {resumable.report.sessions.length === 1 ? "session" : "sessions"}, {openFlags(resumable.report)} flags open. rh keeps it for 30 minutes without activity.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => { dispatch({ type: "resumed", report: resumable.report, bundle: resumable.bundle }); setResumable(null); }}>Resume it</Button>
            <Button variant="ghost" onClick={() => discard(resumable.report.draft)}>Discard it</Button>
          </div>
        </Card>
      )}
      {(state.step === "choose" || state.step === "opening") && (
        <>
          <Connected />
          <ReadyBundles opening={opening} onSend={openBundle} />
        </>
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
          bundle={state.bundle}
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
        <Destination server={state.server} signed={state.signed} onServer={(server) => dispatch({ type: "server", server })} onSigned={(signed) => dispatch({ type: "signed", signed })} onContinue={() => dispatch({ type: "to-confirm" })} onBack={() => dispatch({ type: "back" })} />
      )}
      {(state.step === "confirm" || state.step === "sending") && state.report && state.server !== undefined && (
        <Confirm report={state.report} server={state.server} signed={state.signed} busy={state.step === "sending"} onSend={send} onBack={() => dispatch({ type: "back" })} />
      )}
      {state.step === "shared" && state.delivered?.kind === "code" && <Done sent={state.delivered.sent} onDone={() => dispatch({ type: "reset" })} />}
      {state.step === "shared" && state.delivered?.kind === "pushed" && <Pushed pushed={state.delivered.pushed} onDone={() => dispatch({ type: "reset" })} />}
    </ShareScreen>
  );
}
