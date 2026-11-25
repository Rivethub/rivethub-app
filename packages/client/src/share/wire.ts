import { z } from "zod";
import { descriptive, rows } from "../tolerant.js";
import type {
  DraftFlag,
  DraftReport,
  FindingRow,
  FlagState,
  ImportResult,
  InboundSession,
  IsoTime,
  PushedBundle,
  ReadyBundle,
  ReceiveReport,
  ShareableSession,
  ShareLoginStep,
  ShareServer,
  ShareServers,
} from "@rivethub/contracts";
import { timeSchema } from "../rh/wire.js";

/** The bodies rh's share routes answer with: rivethub-runtime `wire::gateway::share` (CONTRACT note 151) and `share_receive` (note 152). */

const opt = <T extends z.ZodType>(schema: T) => schema.nullish().transform((value) => value ?? undefined).optional();
const time = timeSchema.transform((iso) => iso as IsoTime);

const foundSession = z.object({
  id: z.string(),
  title: opt(z.string()),
  agent: z.string(),
  first: time,
  last: time,
  messages: z.number(),
  excerpts: z.array(z.string()).default([]),
  imported_from: opt(z.string()),
});

export const findReply = z
  .object({ sessions: rows(foundSession) })
  .transform(({ sessions }): ShareableSession[] =>
    sessions.map(({ imported_from, title, ...rest }) => ({
      ...rest,
      ...(title === undefined ? {} : { title }),
      ...(imported_from === undefined ? {} : { importedFrom: imported_from }),
    })),
  );

// Sanitizer actions, login transitions and import verdicts remain strict: guessing could disclose text.
const flagState = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("open") }),
    z.object({ kind: z.literal("keep") }),
    z.object({ kind: z.literal("redact") }),
    z.object({ kind: z.literal("map"), term: z.string(), placeholder: z.string() }),
  ])
  .transform((state): FlagState => state);

const flag = z
  .object({
    number: z.number(),
    score: z.number(),
    session: opt(z.string()),
    place: opt(z.object({ session: z.number(), message: opt(z.number()), field: z.string(), more: z.number() })),
    length: z.number(),
    text: z.string(),
    state: flagState,
  })
  .transform(({ session, place, ...rest }): DraftFlag => ({
    ...rest,
    ...(session === undefined ? {} : { session }),
    ...(place === undefined ? {} : { place: { session: place.session, field: place.field, more: place.more, ...(place.message === undefined ? {} : { message: place.message }) } }),
  }));

export const draftReport = z
  .object({
    draft: z.string(),
    expires_at: time,
    totals: z.object({ secrets: z.number(), mapped: z.number(), redacted: z.number(), escaped: z.number(), rechecked: z.number() }),
    rules: z.array(z.object({ rule: z.string(), count: z.number() })),
    sessions: z.array(z.object({ id: z.string(), agent: z.string(), messages: z.number() })),
    not_scanned: z.string(),
    best_effort: z.string(),
    flags: z.array(flag),
  })
  .transform(({ expires_at, not_scanned, best_effort, ...rest }): DraftReport => ({ ...rest, expiresAt: expires_at, notScanned: not_scanned, bestEffort: best_effort }));

export const draftCreated = draftReport;

export const marksReply = z
  .object({ report: draftReport, rechecked: z.array(z.string()).default([]), learned: opt(z.string()) })
  .transform(({ learned, ...rest }) => ({ ...rest, ...(learned === undefined ? {} : { learned }) }));

export const sentReply = z
  .object({ code: z.string(), expires_at: time, bytes: z.number(), signed: opt(z.string()) })
  .transform(({ expires_at, signed, ...rest }) => ({ ...rest, expiresAt: expires_at, ...(signed === undefined ? {} : { signed }) }));

/**
 * rh decides how each server is reached. An rh older than `delivery` gets the old rule: push only to a
 * team server that names a hub, and a share code otherwise. A push row without a hub, or a delivery this
 * app does not know, can't be routed, so it is dropped rather than guessed.
 */
const shareServer = z
  .object({
    origin: z.string(),
    kind: descriptive(["cloud", "team"]),
    hub: opt(z.string()),
    user: opt(z.string()),
    signed_in: z.boolean(),
    default: z.boolean(),
    delivery: opt(z.enum(["push", "code"])),
    needs_reauth: opt(z.boolean()),
  })
  .transform(({ origin, kind, hub, user, signed_in, default: isDefault, delivery, needs_reauth }) => {
    const base = { origin, kind, signedIn: signed_in, default: isDefault, needsReauth: needs_reauth === true, ...(user === undefined ? {} : { user }) };
    const route = delivery ?? (kind === "team" && hub !== undefined ? "push" : "code");
    if (route === "code") return { ...base, delivery: "code" } satisfies ShareServer;
    return hub === undefined ? undefined : ({ ...base, delivery: "push", hub } satisfies ShareServer);
  })
  .refine((server) => server !== undefined)
  .transform((server): ShareServer => server!);

export const serversReply = z
  .object({
    servers: rows(shareServer),
    token_store: descriptive(["keyring", "file"]),
    // An rh older than the cloud policy leaves it out, and its cloud is on.
    cloud_disabled: z.boolean().default(false),
  })
  .transform(({ servers, token_store, cloud_disabled }): ShareServers => ({ tokenStore: token_store, cloudDisabled: cloud_disabled, servers }));

export const pushedReply = z
  .object({ hub: z.string(), user: z.string(), sessions: z.number(), inserted: z.number(), skipped: z.number() })
  .transform((pushed): PushedBundle => pushed);

const readyBundle = z
  .object({ name: z.string(), sessions: z.number(), bytes: z.number(), open_flags: z.number(), created_at: time, sanitized: z.boolean() })
  .transform(({ open_flags, created_at, ...rest }): ReadyBundle => ({ ...rest, openFlags: open_flags, createdAt: created_at }));

export const bundlesReply = z.object({ bundles: rows(readyBundle) }).transform(({ bundles }) => bundles);

export const loginStep = z
  .discriminatedUnion("state", [
    z.object({
      state: z.literal("started"),
      login: z.string(),
      user_code: z.string(),
      verification_uri_complete: z.string(),
      interval: z.number(),
      expires_at: time,
    }),
    z.object({ state: z.literal("pending"), interval: z.number() }),
    z.object({ state: z.literal("signed_in"), origin: z.string(), user: opt(z.string()) }),
  ])
  .transform((step): ShareLoginStep => {
    switch (step.state) {
      case "started":
        return { state: "started", login: step.login, userCode: step.user_code, verificationUrl: step.verification_uri_complete, interval: step.interval, expiresAt: step.expires_at };
      case "pending":
        return { state: "pending", interval: step.interval };
      case "signed_in":
        return { state: "signed-in", origin: step.origin, ...(step.user === undefined ? {} : { user: step.user }) };
    }
  });

export const keyReply = z.object({ key: z.string(), fingerprint: z.string() });

const verification = descriptive(["verified", "unsigned", "unknown_key"]);
const decision = z.enum(["import", "skip", "hold_spans"]);
const signer = opt(z.object({ key: z.string(), fingerprint: z.string() }));

const findingRow = z
  .object({ event: opt(z.string()), field: z.string(), rule: z.string(), family: descriptive(["secret", "injection"]), kind: z.string(), count: z.number(), excerpt: z.string() })
  .transform(({ event, ...rest }): FindingRow => ({ ...rest, ...(event === undefined ? {} : { event }) }));

const inboundSession = z
  .object({
    n: z.number(),
    author: opt(z.string()),
    title: z.string(),
    agent: z.string(),
    messages: z.number(),
    createdAt: opt(time),
    updatedAt: opt(time),
    findings: z.number(),
    rows: z.array(findingRow).default([]),
    secret: z.boolean(),
    allowed: z.array(decision),
  })
  .transform(({ author, createdAt, updatedAt, ...rest }): InboundSession => ({
    ...rest,
    ...(author === undefined ? {} : { author }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }));

export const receiveReport = z
  .object({
    bundle: z.string(),
    server: z.string(),
    downloaded: z.boolean(),
    author: z.string(),
    node: z.string(),
    verification,
    reason: z.string(),
    signer,
    sessions: z.array(inboundSession),
    authorFindings: z.number(),
    authorRows: z.array(findingRow).default([]),
    summary: z.string(),
    held: z.boolean(),
  })
  .transform(({ signer: key, ...rest }): ReceiveReport => ({ ...rest, ...(key === undefined ? {} : { signer: key }) }));

export const importReply = z
  .object({
    bundle: z.string(),
    receivedAt: time,
    author: z.string(),
    verification,
    signer,
    imported: z.array(
      z.object({ n: z.number(), key: z.string(), verification, verdict: z.enum(["clean", "import", "hold_spans"]), inserted: z.number(), skipped: z.number() }),
    ),
    skipped: z.array(z.number()).default([]),
  })
  .transform(({ signer: key, ...rest }): ImportResult => ({ ...rest, ...(key === undefined ? {} : { signer: key }) }));

export const trustReply = z.object({ senders: z.array(z.object({ name: z.string(), key: z.string(), fingerprint: z.string() })) });
export const untrustReply = z.object({ removed: z.number() });
