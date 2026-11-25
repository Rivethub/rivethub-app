import { HttpError, NetworkError, ReauthRequiredError, RouteMissingError } from "@rivethub/client";

/** A refusal rendered for a person: what happened, and where to go to fix it. */
export interface Failure {
  /** rh's reason, when it gave one. */
  code?: string;
  /** The person has to sign in again before the action can succeed. */
  reauth?: boolean;
  title: string;
  detail?: string;
  /** The step of the flow that can fix it. Receive and send each name their own. */
  backTo?: "choose" | "decide" | "review" | "destination" | "confirm";
}

const SEND: Record<string, Failure> = {
  not_local: { title: "Share from the machine rh runs on.", detail: "Sharing works only from the app on the same computer as your rh node." },
  decide_unconfigured: { title: "The decision model isn't set up.", detail: "Set memory.sanitize.decide in your rh config to have it flag suspicious text. Its second look is now off, so you can sanitize without it.", backTo: "decide" },
  unknown_draft: { title: "Your draft expired.", detail: "Drafts stay in rh's memory for 30 minutes. Decide again to make a new one.", backTo: "decide" },
  full: { title: "Too many drafts are open.", detail: "Wait a moment, or discard a draft from another window, then try again.", backTo: "decide" },
  open_flags: { title: "Some flags are still open.", detail: "Keep, redact or map every flag before you share.", backTo: "review" },
  counts: { title: "The draft changed since you confirmed it.", detail: "Review the flags again, then confirm.", backTo: "review" },
  invalid: { title: "rh refused that request.", detail: "Check the terms and placeholders you entered." },
  unknown_sessions: { title: "A session you chose is no longer in memory.", backTo: "choose" },
  signed_out: { title: "You're signed out of that server.", detail: "Sign in to it again, then share. Your draft is kept.", backTo: "destination" },
  login_expired: { title: "That sign-in expired.", detail: "Start it again.", backTo: "destination" },
  login_denied: { title: "The sign-in was denied or timed out.", detail: "Start it again and approve it in your browser.", backTo: "destination" },
  unknown_login: { title: "That sign-in is no longer open.", detail: "Start it again.", backTo: "destination" },
  bad_token: { title: "The server didn't accept that token.", detail: "Check it and try again.", backTo: "destination" },
  bad_server: { title: "This hub's policy doesn't allow that server.", backTo: "destination" },
  drop_box: { title: "The drop box refused the bundle.", detail: "Your draft is kept. Try again, or choose another server.", backTo: "confirm" },
  unreachable: { title: "Couldn't reach the server.", detail: "Your draft is kept. Check your connection and try again.", backTo: "confirm" },
  failed: { title: "rh couldn't finish that.", detail: "The rh log has the cause." },
};

/** Opening a ready bundle refuses for its own reasons, and every one goes back to choosing. */
const OPEN_BUNDLE: Record<string, Failure> = {
  ...SEND,
  unknown_bundle: { title: "That bundle is no longer here.", detail: "It was sent or removed since the list loaded. The list is up to date now.", backTo: "choose" },
  open_flags: {
    title: "This bundle's flags can't be shown here.",
    detail: "Its local review files are missing, so its open flags can't be reviewed in the app. Settle them with rh memory sanitize --resolve, then send it.",
    backTo: "choose",
  },
  invalid: { title: "rh can't open a bundle by that name.", backTo: "choose" },
};

/** The destination server refused this rh's login there, such as a token without the scope a push needs. */
const LOGIN_REFUSED: Failure = {
  title: "That server refused your login there.",
  detail: "Your login may lack the scope this needs. Sign in to it again, or choose another server. Your draft is kept.",
  backTo: "destination",
};

/** The chosen server changed or left the list between Confirm and Share. */
export const DESTINATION_GONE: Failure = {
  title: "That server is no longer available as you confirmed it.",
  detail: "It was signed out, changed, or turned off by this hub's policy. Choose a server again. Your draft is kept.",
  backTo: "destination",
};

const RECEIVE: Record<string, Failure> = {
  not_local: SEND["not_local"]!,
  bad_code: { title: "That isn't a valid share code.", detail: "A character is probably mistyped. Nothing was downloaded." },
  already_received: { title: "You already received this bundle.", detail: "It was imported on this machine before." },
  gone: { title: "That drop is gone.", detail: "It expired, was revoked, or was already downloaded. Ask the sender to share again." },
  burned: { title: "The download stopped partway and the drop is burned.", detail: "A drop works once. Ask the sender to share again." },
  too_large: { title: "That bundle is too large to receive." },
  unreachable: { title: "Couldn't reach the server that holds the drop.", detail: "Check your connection and try again. Nothing was used up." },
  refused: { title: "The server refused the download." },
  undecryptable: { title: "That code doesn't open this bundle.", detail: "The key in the code is wrong. Ask the sender for the whole code." },
  unreadable: { title: "The bundle is unreadable.", detail: "It may be damaged, or made by a newer version." },
  bad_signature: { title: "The signature is invalid, so the bundle was refused.", detail: "It was changed after it was signed, or the signer isn't who it claims." },
  raw: { title: "That bundle was never sanitized, so it was refused." },
  withheld: { title: "That bundle still withholds flagged chunks, so it was refused." },
  no_such_session: { title: "A session you chose isn't in the bundle." },
  undecided: { title: "Some flagged sessions still need a decision.", detail: "Choose import, skip or hold spans for each one." },
  secret_import: { title: "A session with a secret can only be skipped or held.", detail: "Hold its spans or skip it." },
  author_findings: { title: "The sender's own details carry a finding.", detail: "The bundle can't be imported as it is." },
  bad_key: { title: "That key isn't valid." },
  bad_name: { title: "Give the sender a name." },
  duplicate: { title: "That sender and key are already trusted." },
  failed: SEND["failed"]!,
};

const REAUTH: Failure = {
  reauth: true,
  title: "Confirm it's you first.",
  detail: "This action needs a fresh sign-in. Sign in again, and RivetHub keeps your place.",
};

/** Turns anything a share call throws into a Failure the screen can show. The server's own message is shown only when no sentence is known. */
export function describeFailure(error: unknown, flow: "send" | "open-bundle" | "receive"): Failure {
  if (error instanceof ReauthRequiredError) return REAUTH;
  if (error instanceof RouteMissingError) {
    return { title: "This rh is too old for sharing.", detail: "Update RivetHub to a version that includes the share routes." };
  }
  if (error instanceof NetworkError) return { title: "RivetHub couldn't reach rh.", detail: "Check that your rh node is running." };
  if (error instanceof HttpError) {
    // A refusal that names its reason is about the share server, so it is read before a bare 401 ends this window's session.
    if (flow === "send" && error.code === "drop_box" && (error.upstreamStatus === 401 || error.upstreamStatus === 403)) return { ...LOGIN_REFUSED, code: error.code };
    const known = error.code === undefined ? undefined : { send: SEND, "open-bundle": OPEN_BUNDLE, receive: RECEIVE }[flow][error.code];
    if (known) {
      const detail = error.code === "undecided" || error.code === "secret_import" ? `${known.detail ?? ""}${sessionsNote(error.sessions)}`.trim() : known.detail;
      return { ...known, code: error.code!, ...(detail === undefined ? {} : { detail }) };
    }
    if (error.status === 401) return { ...REAUTH, title: "You're signed out.", detail: "Sign in again to continue." };
    return { title: "rh refused that.", detail: error.message.replace(/^\d+ \S+: /, "") };
  }
  return error instanceof Error ? { title: "Something went wrong.", detail: error.message } : { title: "Something went wrong." };
}

const sessionsNote = (sessions: number[] | undefined) => (sessions?.length ? ` Sessions ${sessions.join(", ")}.` : "");
