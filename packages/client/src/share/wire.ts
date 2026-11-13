import { z } from "zod";
import type {
  DraftFlag,
  DraftReport,
  FindingRow,
  FlagState,
  ImportResult,
  InboundSession,
  IsoTime,
  ReceiveReport,
  ShareableSession,
  ShareLoginStep,
  ShareServers,
} from "@rivethub/contracts";
import { timeSchema } from "../rh/wire.js";

/** The bodies rh's share routes answer with: rivethub-runtime `wire::gateway::share` (CONTRACT note 151) and `share_receive` (note 152). */

const opt = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((value) => value ?? undefined);
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
  .object({ sessions: z.array(foundSession) })
  .transform(({ sessions }): ShareableSession[] =>
    sessions.map(({ imported_from, title, ...rest }) => ({
      ...rest,
      ...(title === undefined ? {} : { title }),
      ...(imported_from === undefined ? {} : { importedFrom: imported_from }),
    })),
  );

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

export const serversReply = z
  .object({
    servers: z.array(z.object({ origin: z.string(), kind: z.enum(["cloud", "team"]), user: opt(z.string()), signed_in: z.boolean(), default: z.boolean() })),
    token_store: z.enum(["keyring", "file"]),
  })
  .transform(
    ({ servers, token_store }): ShareServers => ({
      tokenStore: token_store,
      servers: servers.map(({ signed_in, user, ...rest }) => ({ ...rest, signedIn: signed_in, ...(user === undefined ? {} : { user }) })),
    }),
  );

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

const verification = z.enum(["verified", "unsigned", "unknown_key"]);
const decision = z.enum(["import", "skip", "hold_spans"]);
const signer = opt(z.object({ key: z.string(), fingerprint: z.string() }));

const findingRow = z
  .object({ event: opt(z.string()), field: z.string(), rule: z.string(), family: z.enum(["secret", "injection"]), kind: z.string(), count: z.number(), excerpt: z.string() })
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
