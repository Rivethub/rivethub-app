import { HttpError, NetworkError, ReauthRequiredError } from "@rivethub/client";
import type { DraftReport, ImportResult, IsoTime, ReadyBundle, ReceiveReport, RivetHubDesktop, ShareClient, ShareableSession, ShareServer } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import type { AppClient } from "../client/context";
import { createSampleClient } from "../dev/sample-client";
import { listedServers } from "../share/destination";

const at = (iso: string) => iso as IsoTime;
const found = (id: string, title: string): ShareableSession => ({ id, title, agent: "claude-code", first: at("2026-11-01T10:00:00Z"), last: at("2026-11-01T11:00:00Z"), messages: 6, excerpts: [`about ${title}`] });
const SESSIONS = [found("s-1", "Retention policy"), found("s-2", "Backup window"), found("s-3", "Private notes")];
const CODE = "rivethub:AbCdEfGhIjKlMnOpQrStUv#TOPSECRETKEY";

const flagged = (state: "open" | "keep" = "open"): DraftReport => ({
  draft: "d-1",
  expiresAt: at("2026-11-12T10:00:00Z"),
  totals: { secrets: 2, mapped: 0, redacted: 1, escaped: 1, rechecked: 0 },
  rules: [{ rule: "aws-key", count: 2 }],
  sessions: [
    { id: "s-1", agent: "claude-code", messages: 6 },
    { id: "s-2", agent: "claude-code", messages: 6 },
  ],
  notScanned: "Images are not scanned.",
  bestEffort: "Best effort: read the flags yourself.",
  flags: [
    { number: 1, score: 0.9, length: 8, text: "ignore<U+202E>me", place: { session: 1, message: 2, field: "content", more: 0 }, state: { kind: state } },
    { number: 2, score: 0.4, length: 4, text: "alex", place: { session: 2, field: "title", more: 1 }, state: { kind: state } },
  ],
});

function fakeShare(overrides: Partial<ShareClient> = {}): ShareClient {
  return {
    find: vi.fn(async () => SESSIONS),
    createDraft: vi.fn(async () => flagged()),
    draft: vi.fn(async () => flagged()),
    mark: vi.fn(async () => {
      const report = flagged("keep");
      report.flags[1]!.state = { kind: "map", term: "alex", placeholder: "PERSON_1" };
      return { report, rechecked: [] };
    }),
    discard: vi.fn(async () => {}),
    send: vi.fn(async () => ({ code: CODE, expiresAt: at("2026-11-19T10:00:00Z"), bytes: 2048, signed: "SHA256:abc" })),
    push: vi.fn(),
    bundles: vi.fn(async () => []),
    draftFromBundle: vi.fn(),
    servers: vi.fn(async () => ({ tokenStore: "file" as const, cloudDisabled: false, servers: [{ origin: "http://127.0.0.1:61522", kind: "team" as const, delivery: "code" as const, user: "phil", signedIn: true, default: true, needsReauth: false }] })),
    login: vi.fn(),
    pollLogin: vi.fn(),
    logout: vi.fn(async () => {}),
    key: vi.fn(async () => ({ key: "ed25519:AAAA", fingerprint: "SHA256:abc" })),
    receive: vi.fn(),
    importReceived: vi.fn(),
    trusted: vi.fn(async () => []),
    trust: vi.fn(async () => {}),
    untrust: vi.fn(async () => 1),
    ...overrides,
  };
}

function renderAt(path: string, share?: ShareClient, extra: Partial<AppClient> = {}) {
  const client = { ...createSampleClient(), ...(share ? { share } : {}), ...extra };
  const user = userEvent.setup();
  render(<App client={client} history={createMemoryHistory({ initialEntries: [path] })} />);
  return { user };
}

const bridge = (relogin = vi.fn(async (): Promise<string | null> => "one-time-code")): RivetHubDesktop => ({ relogin, updates: { getState: vi.fn(), onState: vi.fn(() => () => {}), setChannel: vi.fn(), restartToUpdate: vi.fn() } as never });

const exchange = vi.fn();

beforeEach(() => {
  (window as { rivethub?: RivetHubDesktop }).rivethub = bridge();
  exchange.mockReset().mockResolvedValue(new Response(JSON.stringify({ csrf: "csrf-fresh" }), { status: 200 }));
  vi.stubGlobal("fetch", exchange);
});
afterEach(() => {
  delete (window as { rivethub?: RivetHubDesktop }).rivethub;
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const exchangedOnce = () => {
  expect(exchange).toHaveBeenCalledOnce();
  const [url, init] = exchange.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/auth/session");
  expect(init).toMatchObject({ method: "POST", credentials: "same-origin", body: JSON.stringify({ code: "one-time-code" }) });
  expect(localStorage.getItem("rh-csrf")).toBe("csrf-fresh");
};

describe("Settings server", () => {
  it("shows this node, the spaces on it, and each share server without claiming the window can switch", async () => {
    const { user } = renderAt("/settings/server", fakeShare({
      servers: vi.fn(async () => ({
        tokenStore: "file" as const,
        cloudDisabled: false,
        servers: [
          { origin: "https://192.0.2.14:5174", kind: "team" as const, delivery: "code" as const, user: "phil", signedIn: true, default: true, needsReauth: false },
          { origin: "https://rivethub.cloud", kind: "cloud" as const, delivery: "code" as const, signedIn: false, default: false, needsReauth: false },
        ],
      })),
    }));
    const node = await screen.findByRole("region", { name: "This node" });
    expect(within(node).getByText("workstation")).toBeInTheDocument();
    expect(within(node).getByText("Spaces on this node: This device")).toBeInTheDocument();
    const team = screen.getByRole("region", { name: "Team servers" });
    expect(within(team).getByText("A team server connection sends and receives shared sessions. It does not switch this window.")).toBeInTheDocument();
    expect(within(team).getByText("192.0.2.14:5174")).toBeInTheDocument();
    expect(within(team).getByText("Share server · gives a share code · signed in as phil · default")).toBeInTheDocument();
    expect(within(team).getByText("rivethub.cloud")).toBeInTheDocument();
    expect(within(team).getByText("RivetHub Cloud drop box · gives a share code · signed out")).toBeInTheDocument();
    expect(screen.queryByText(/not available yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open another hub/)).not.toBeInTheDocument();
    await user.click(within(team).getByRole("button", { name: "Add a team server" }));
    expect(within(team).getByText("Server address")).toBeInTheDocument();
    expect(within(team).getByText("Your token for that server")).toBeInTheDocument();
  });

  it("says a team server is added in the desktop app when this page cannot share", async () => {
    renderAt("/settings/server");
    expect(await screen.findByText("Adding a team server is in the RivetHub desktop app.")).toBeInTheDocument();
    expect(screen.getByText("Spaces on this node: This device")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a team server" })).not.toBeInTheDocument();
  });
});

describe("Share", () => {
  it("walks from search to a code that is shown once and gone after Done", async () => {
    const share = fakeShare();
    const { user } = renderAt("/share", share);

    await user.type(await screen.findByRole("searchbox", { name: /Find sessions to share/ }), "retention");
    for (const title of ["Retention policy", "Backup window", "Private notes"]) await user.click(await screen.findByRole("checkbox", { name: new RegExp(title) }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const confirm = screen.getByRole("button", { name: "Confirm decisions and sanitize" });
    expect(confirm).toBeDisabled();
    const decide = (title: string, option: string) => user.click(within(screen.getByRole("group", { name: `Decision for ${title}` })).getByRole("radio", { name: option }));
    await decide("Retention policy", "Redact");
    await user.type(screen.getByRole("textbox", { name: /Add a term to redact in Retention policy/ }), "alex{Enter}");
    await user.click(screen.getByRole("checkbox", { name: "Drop tool outputs in Retention policy" }));
    await decide("Backup window", "Approve");
    await decide("Private notes", "Deny");
    expect(share.createDraft).not.toHaveBeenCalled();
    await user.click(confirm);

    await waitFor(() =>
      expect(share.createDraft).toHaveBeenCalledWith(
        [
          { id: "s-1", decision: { kind: "redact", terms: ["alex"], dropToolOutputs: true } },
          { id: "s-2", decision: { kind: "approve" } },
        ],
        { decide: true },
      ),
    );
    expect(await screen.findByText("Best effort: read the flags yourself.")).toBeInTheDocument();
    expect(screen.getByLabelText("Flagged text of Flag 1")).toHaveTextContent("ignore<U+202E>me");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByText(/2 flags are still open/)).toBeInTheDocument();

    await user.click(within(screen.getByRole("group", { name: "Choice for Flag 1" })).getByRole("radio", { name: "Keep" }));
    await user.click(within(screen.getByRole("group", { name: "Choice for Flag 2" })).getByRole("radio", { name: "Map" }));
    await user.type(screen.getByLabelText("Placeholder"), "PERSON_1");
    await user.click(screen.getByRole("button", { name: "Apply 2 choices" }));
    await waitFor(() =>
      expect(share.mark).toHaveBeenCalledWith("d-1", [
        { number: 1, choice: { kind: "keep" } },
        { number: 2, choice: { kind: "map", term: "alex", placeholder: "PERSON_1" } },
      ]),
    );
    await user.click(await screen.findByRole("button", { name: "Continue" }));

    await user.click(await screen.findByRole("radio", { name: /127\.0\.0\.1:61522/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Works once, and expires after 7 days.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Share and get a code" }));
    await waitFor(() => expect(share.send).toHaveBeenCalledWith("d-1", { server: "http://127.0.0.1:61522", signed: true, confirm: { sessions: 2, keptFlags: 1 } }));

    const code = await screen.findByRole("status", { name: "Share code" });
    expect(code).toHaveTextContent(CODE);
    expect(screen.getByText(/Send it in person or in an end-to-end encrypted chat/)).toBeInTheDocument();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage }) + location.href).not.toContain("TOPSECRETKEY");

    await user.click(screen.getByRole("button", { name: /Done, remove the code/ }));
    expect(screen.queryByText(CODE)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("TOPSECRETKEY");
  });

  it("asks for a fresh sign-in when sending needs one, signs in in place, and shares without redoing a step", async () => {
    const relogin = vi.fn(async () => "one-time-code");
    (window as { rivethub?: RivetHubDesktop }).rivethub = bridge(relogin);
    const send = vi.fn().mockRejectedValueOnce(new ReauthRequiredError("/api/share/drafts/d-1/send")).mockResolvedValue({ code: CODE, expiresAt: at("2026-11-19T10:00:00Z"), bytes: 2048, signed: "SHA256:abc" });
    const share = fakeShare({ draft: vi.fn(async () => flagged("keep")), send });
    sessionStorage.setItem("rivethub.share.draft", "d-1");
    const { user } = renderAt("/share", share);

    await user.click(await screen.findByRole("button", { name: "Resume it" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("radio", { name: /127\.0\.0\.1:61522/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Share and get a code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Confirm it's you first.");
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(await screen.findByText(/Signed in again/)).toBeInTheDocument();
    expect(relogin).toHaveBeenCalledOnce();
    exchangedOnce();
    await user.click(screen.getByRole("button", { name: "Share and get a code" }));
    expect(await screen.findByRole("status", { name: "Share code" })).toHaveTextContent(CODE);
    expect(share.draft).toHaveBeenCalledOnce();
  });

  it("says so when it can't sign in again, and exchanges nothing", async () => {
    (window as { rivethub?: RivetHubDesktop }).rivethub = bridge(vi.fn(async () => null));
    const send = vi.fn().mockRejectedValue(new ReauthRequiredError("/api/share/drafts/d-1/send"));
    sessionStorage.setItem("rivethub.share.draft", "d-1");
    const { user } = renderAt("/share", fakeShare({ draft: vi.fn(async () => flagged("keep")), send }));
    await user.click(await screen.findByRole("button", { name: "Resume it" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("radio", { name: /127\.0\.0\.1:61522/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Share and get a code" }));
    await user.click(await screen.findByRole("button", { name: "Sign in again" }));
    expect(await screen.findByText(/Couldn't sign in again/)).toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
  });

  it("shows no Share or Receive outside the desktop app", async () => {
    delete (window as { rivethub?: RivetHubDesktop }).rivethub;
    const { user } = renderAt("/share", fakeShare());
    expect(await screen.findByText("Sharing is in the RivetHub desktop app.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Share" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Receive" })).not.toBeInTheDocument();
    expect(user).toBeDefined();
  });
});

describe("Share destinations and ready bundles", () => {
  const studio: ShareServer = { origin: "https://192.0.2.20:5174", kind: "team", delivery: "push", hub: "studio", user: "phil", signedIn: true, default: false, needsReauth: false };
  const drop: ShareServer = { origin: "https://198.51.100.7", kind: "team", delivery: "code", user: "phil", signedIn: true, default: false, needsReauth: false };
  const cloud: ShareServer = { origin: "https://rivethub.cloud", kind: "cloud", delivery: "code", signedIn: false, default: false, needsReauth: false };
  const ready: ReadyBundle = { name: "retention-nov", sessions: 2, bytes: 18432, openFlags: 2, createdAt: at("2026-11-20T09:30:00Z"), sanitized: true };
  const clean = (): DraftReport => ({ ...flagged(), flags: [] });
  const signedOutCloudOff = async () => {
    const { email: _, ...rest } = await createSampleClient().account();
    return { ...rest, cloudDisabled: true };
  };
  const serving = (servers: ShareServer[], cloudDisabled = false) => vi.fn(async () => ({ tokenStore: "file" as const, cloudDisabled, servers }));

  it("lists each connected server by its hub name with the hub's online state, and other hubs not set up for sharing", async () => {
    renderAt("/share", fakeShare({ servers: serving([studio, drop]) }));
    const connected = await screen.findByRole("region", { name: "Connected" });
    const hub = await within(connected).findByRole("listitem", { name: "studio" });
    expect(hub).toHaveTextContent("Hub at 192.0.2.20:5174 · pushes sessions into it · signed in as phil");
    expect(hub).toHaveTextContent("Online");
    expect(within(connected).getByRole("listitem", { name: "198.51.100.7" })).toHaveTextContent("Share server · gives a share code · signed in as phil");
    const other = within(connected).getByRole("listitem", { name: "lab-server" });
    expect(other).toHaveTextContent("not set up for sharing");
    expect(other).toHaveTextContent("Offline");
    expect(within(connected).getByRole("button", { name: "Add a team server" })).toBeInTheDocument();
  });

  it("sends a ready bundle to a team hub after its flags are confirmed, and shows what the hub took in", async () => {
    const share = fakeShare({
      servers: serving([studio, drop]),
      bundles: vi.fn(async () => [ready]),
      draftFromBundle: vi.fn(async () => flagged("keep")),
      push: vi.fn(async () => ({ hub: "studio", user: "phil", sessions: 2, inserted: 41, skipped: 3 })),
    });
    const { user } = renderAt("/share", share);
    const bundle = await screen.findByRole("listitem", { name: "retention-nov" });
    expect(bundle).toHaveTextContent("2 sessions · 18 KB · Nov 20");
    expect(bundle).toHaveTextContent("2 flags need your decision before it can leave.");
    await user.click(within(bundle).getByRole("button", { name: "Send retention-nov" }));
    await waitFor(() => expect(share.draftFromBundle).toHaveBeenCalledWith("retention-nov"));

    expect(await screen.findByText("Best effort: read the flags yourself.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("radio", { name: /studio/ }));
    expect(screen.queryByRole("region", { name: "Signing" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("studio (192.0.2.20:5174)")).toBeInTheDocument();
    expect(screen.getByText("Push into studio as phil")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Push into studio" }));

    await waitFor(() => expect(share.push).toHaveBeenCalledWith("d-1", { hub: "studio", confirm: { sessions: 2, keptFlags: 2 } }));
    expect(share.send).not.toHaveBeenCalled();
    const result = await screen.findByRole("region", { name: "Added to studio" });
    const counts = within(result).getByLabelText("Push result");
    expect(within(counts).getByText("Sessions").nextSibling).toHaveTextContent("2");
    expect(within(counts).getByText("Inserted").nextSibling).toHaveTextContent("41");
    expect(within(counts).getByText("Skipped").nextSibling).toHaveTextContent("3");
    expect(screen.queryByRole("status", { name: "Share code" })).not.toBeInTheDocument();
  });

  it("sends a ready bundle to a drop server and shows the share code", async () => {
    const share = fakeShare({
      servers: serving([studio, { ...drop, default: true }]),
      bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]),
      draftFromBundle: vi.fn(async () => clean()),
    });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    expect(await screen.findByRole("radio", { name: /198\.51\.100\.7/ })).toBeChecked();
    expect(screen.getByRole("region", { name: "Signing" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Works once, and expires after 7 days.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Share and get a code" }));
    await waitFor(() => expect(share.send).toHaveBeenCalledWith("d-1", { server: "https://198.51.100.7", signed: true, confirm: { sessions: 2, keptFlags: 0 } }));
    expect(share.push).not.toHaveBeenCalled();
    expect(await screen.findByRole("status", { name: "Share code" })).toHaveTextContent(CODE);
  });

  it("goes back to choosing when a bundle can't be opened", async () => {
    const share = fakeShare({ bundles: vi.fn(async () => [ready]), draftFromBundle: vi.fn(async () => Promise.reject(new Error("bundle is damaged"))) });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("bundle is damaged");
    expect(screen.getByRole("searchbox", { name: /Find sessions to share/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send retention-nov" })).toBeEnabled();
  });

  it("offers no cloud server or cloud sign-in when cloud is off, and keeps team servers working", async () => {
    const share = fakeShare({ servers: serving([cloud, studio], true), bundles: vi.fn(async () => [ready]), draftFromBundle: vi.fn(async () => clean()) });
    const { user } = renderAt("/share", share);
    const connected = await screen.findByRole("region", { name: "Connected" });
    expect(await within(connected).findByRole("listitem", { name: "studio" })).toBeInTheDocument();
    expect(within(connected).queryByText(/rivethub\.cloud|RivetHub Cloud/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send retention-nov" }));
    expect(await screen.findByRole("radio", { name: /studio/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /rivethub\.cloud/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in to rivethub\.cloud/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a team server" })).toBeInTheDocument();
  });

  it("shows the cloud server and its sign-in when cloud is on", async () => {
    const share = fakeShare({ servers: serving([cloud, studio]), bundles: vi.fn(async () => [ready]), draftFromBundle: vi.fn(async () => clean()) });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    expect(await screen.findByRole("radio", { name: /rivethub\.cloud/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to rivethub.cloud" })).toBeInTheDocument();
  });

  it("opens a flagged bundle on its flag review, without scan totals it doesn't have, and pushes it once the flags are settled", async () => {
    const fromBundle = (state: "open" | "keep"): DraftReport => ({ ...flagged(state), totals: { secrets: 0, mapped: 0, redacted: 0, escaped: 0, rechecked: 0 }, rules: [] });
    const share = fakeShare({
      servers: serving([studio]),
      bundles: vi.fn(async () => [ready]),
      draftFromBundle: vi.fn(async () => fromBundle("open")),
      mark: vi.fn(async () => ({ report: fromBundle("keep"), rechecked: [] })),
      push: vi.fn(async () => ({ hub: "studio", user: "phil", sessions: 2, inserted: 12, skipped: 0 })),
    });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));

    expect(await screen.findByText(/2 flags are still open/)).toBeInTheDocument();
    expect(screen.getByText("retention-nov was sanitized when it was exported. Its counts are in the bundle's local report.")).toBeInTheDocument();
    expect(screen.queryByText(/secrets removed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Changes by rule" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    for (const n of [1, 2]) await user.click(within(screen.getByRole("group", { name: `Choice for Flag ${n}` })).getByRole("radio", { name: "Keep" }));
    await user.click(screen.getByRole("button", { name: "Apply 2 choices" }));
    await waitFor(() => expect(share.mark).toHaveBeenCalledWith("d-1", [{ number: 1, choice: { kind: "keep" } }, { number: 2, choice: { kind: "keep" } }]));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("radio", { name: /studio/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Push into studio" }));
    await waitFor(() => expect(share.push).toHaveBeenCalledWith("d-1", { hub: "studio", confirm: { sessions: 2, keptFlags: 2 } }));
  });

  it("refreshes the list and says so when a bundle is already gone", async () => {
    const bundles = vi.fn().mockResolvedValueOnce([ready]).mockResolvedValue([]);
    const share = fakeShare({ bundles, draftFromBundle: vi.fn().mockRejectedValue(new HttpError(404, "/api/share/drafts/from-bundle", "no bundle", "unknown_bundle")) });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That bundle is no longer here.");
    expect(await screen.findByText(/No exported bundles are waiting/)).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /Find sessions to share/ })).toBeInTheDocument();
  });

  it("says how to settle a bundle's flags when its local review files are missing", async () => {
    const share = fakeShare({ bundles: vi.fn(async () => [ready]), draftFromBundle: vi.fn().mockRejectedValue(new HttpError(409, "/api/share/drafts/from-bundle", "open flags", "open_flags")) });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Its local review files are missing");
    expect(alert).toHaveTextContent("rh memory sanitize --resolve");
    expect(screen.getByRole("button", { name: "Send retention-nov" })).toBeEnabled();
  });

  it("pushes to a hub reached by a device sign-in, because rh says it takes pushes", async () => {
    const home: ShareServer = { origin: "https://memory.example.net", kind: "cloud", delivery: "push", hub: "home", user: "phil", signedIn: true, default: true, needsReauth: false };
    const share = fakeShare({
      servers: serving([home]),
      bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]),
      draftFromBundle: vi.fn(async () => clean()),
      push: vi.fn(async () => ({ hub: "home", user: "phil", sessions: 2, inserted: 2, skipped: 0 })),
    });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    expect(await screen.findByRole("radio", { name: /home/ })).toBeChecked();
    expect(screen.getByText("Push into home as phil.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Signing" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Push into home as phil")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Push into home" }));
    await waitFor(() => expect(share.push).toHaveBeenCalledWith("d-1", { hub: "home", confirm: { sessions: 2, keptFlags: 0 } }));
    expect(share.send).not.toHaveBeenCalled();
  });

  it("asks to sign in again instead of offering a push the stored login can't make", async () => {
    const share = fakeShare({ servers: serving([{ ...studio, needsReauth: true }]), bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]), draftFromBundle: vi.fn(async () => clean()) });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    const radio = await screen.findByRole("radio", { name: /studio/ });
    expect(radio).toBeDisabled();
    expect(screen.getByText(/sign in again to push to studio/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sign in again to 192.0.2.20:5174" }));
    expect(screen.getByLabelText("Server address")).toHaveValue("https://192.0.2.20:5174");
    expect(screen.getByText(/Paste a new token from its admin that includes memory:import/)).toBeInTheDocument();
  });

  it("offers no cloud drop box until the account has said whether cloud is on", async () => {
    const share = fakeShare({ servers: serving([cloud, studio]), bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]), draftFromBundle: vi.fn(async () => clean()) });
    const { user } = renderAt("/share", share, { account: () => new Promise(() => {}) });
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    expect(await screen.findByRole("radio", { name: /studio/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /rivethub\.cloud/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in to rivethub.cloud" })).not.toBeInTheDocument();
  });

  it("keeps a private drop box that rh labels cloud when cloud is off, and hides only rivethub.cloud", async () => {
    const privateBox: ShareServer = { origin: "https://drops.example.org", kind: "cloud", delivery: "code", user: "phil", signedIn: true, default: true, needsReauth: false };
    const share = fakeShare({ servers: serving([cloud, privateBox, studio], true), bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]), draftFromBundle: vi.fn(async () => clean()) });
    const { user } = renderAt("/share", share, { account: signedOutCloudOff });
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    expect(await screen.findByRole("radio", { name: /drops\.example\.org/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /studio/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /rivethub\.cloud/ })).not.toBeInTheDocument();
  });

  it("lists by rivethub.cloud's host, as the runtime names it, whatever its port, case or scheme", () => {
    const withOrigin = (origin: string): ShareServer => ({ ...cloud, origin });
    const listed = (origin: string) => listedServers({ tokenStore: "file", cloudDisabled: true, servers: [withOrigin(origin)] }, "off").length === 1;
    for (const hidden of ["https://rivethub.cloud", "rivethub.cloud", "https://RivetHub.Cloud:443", "rivethub.cloud:8443", "https://rivethub.cloud./"]) expect(listed(hidden), hidden).toBe(false);
    for (const shown of ["https://drops.rivethub.cloud", "https://rivethub.cloud.evil.example", "https://evil.example/rivethub.cloud", "https://rivethub.cloud@evil.example"]) expect(listed(shown), shown).toBe(true);
  });

  it("does not let the first server's late sign-in reply replace the second server's code", async () => {
    const other: ShareServer = { origin: "https://drops.example.org", kind: "cloud", delivery: "code", signedIn: false, default: false, needsReauth: false };
    const started = (origin: string, userCode: string) => ({ state: "started" as const, login: `l-${userCode}`, userCode, verificationUrl: `${origin}/device`, interval: 60, expiresAt: at("2026-11-25T12:00:00Z") });
    let releaseFirst: () => void = () => {};
    const login = vi.fn(async (request: { origin: string }) => {
      if (request.origin === cloud.origin) await new Promise<void>((resolve) => (releaseFirst = resolve));
      return started(request.origin, request.origin === cloud.origin ? "AAAA-AAAA" : "BBBB-BBBB");
    });
    const share = fakeShare({ servers: serving([cloud, other]), bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]), draftFromBundle: vi.fn(async () => clean()), login });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    await user.click(await screen.findByRole("button", { name: "Sign in to rivethub.cloud" }));
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Sign in to drops.example.org" }));
    expect(await screen.findByLabelText("Sign-in code BBBB-BBBB")).toBeInTheDocument();

    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByLabelText("Sign-in code BBBB-BBBB")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sign-in code AAAA-AAAA")).not.toBeInTheDocument();
  });

  it("stops a cloud sign-in in progress when the policy turns cloud off", async () => {
    let cloudOff = false;
    const servers = vi.fn(async () => ({ tokenStore: "file" as const, cloudDisabled: cloudOff, servers: cloudOff ? [studio] : [cloud, studio] }));
    const pollLogin = vi.fn(async () => ({ state: "pending" as const, interval: 0.02 }));
    const share = fakeShare({
      servers,
      bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]),
      draftFromBundle: vi.fn(async () => clean()),
      login: vi.fn(async () => ({ state: "started" as const, login: "l-1", userCode: "ABCD-EFGH", verificationUrl: "https://rivethub.cloud/device", interval: 0.02, expiresAt: at("2026-11-25T12:00:00Z") })),
      pollLogin,
    });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    await user.click(await screen.findByRole("button", { name: "Sign in to rivethub.cloud" }));
    expect(await screen.findByLabelText("Sign-in code ABCD-EFGH")).toBeInTheDocument();
    await waitFor(() => expect(pollLogin).toHaveBeenCalled());

    cloudOff = true;
    await user.click(screen.getByRole("button", { name: "Sign out of 192.0.2.20:5174" }));
    await waitFor(() => expect(screen.queryByLabelText("Sign-in code ABCD-EFGH")).not.toBeInTheDocument());
    const polled = pollLogin.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(pollLogin.mock.calls.length).toBe(polled);
    expect(screen.queryByRole("radio", { name: /rivethub\.cloud/ })).not.toBeInTheDocument();
  });

  it("checks the server is still listed as confirmed right before sending, and sends nothing when it isn't", async () => {
    let listed = [studio];
    const share = fakeShare({
      servers: vi.fn(async () => ({ tokenStore: "file" as const, cloudDisabled: false, servers: listed })),
      bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]),
      draftFromBundle: vi.fn(async () => clean()),
    });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    await user.click(await screen.findByRole("radio", { name: /studio/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    listed = [{ ...studio, signedIn: false }];
    await user.click(await screen.findByRole("button", { name: "Push into studio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That server is no longer available as you confirmed it.");
    expect(share.push).not.toHaveBeenCalled();
    expect(await screen.findByRole("radio", { name: /studio/ })).toBeDisabled();
  });

  it("goes back to the destination with the draft kept when the server says the login there is signed out", async () => {
    let signedIn = true;
    const servers = vi.fn(async () => ({ tokenStore: "file" as const, cloudDisabled: false, servers: [{ ...studio, signedIn }] }));
    const push = vi
      .fn()
      .mockImplementationOnce(async () => {
        signedIn = false;
        throw new HttpError(401, "/api/share/drafts/d-1/push", "signed out of studio", "signed_out");
      })
      .mockResolvedValue({ hub: "studio", user: "phil", sessions: 2, inserted: 2, skipped: 0 });
    const share = fakeShare({ servers, push, bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]), draftFromBundle: vi.fn(async () => clean()) });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    await user.click(await screen.findByRole("radio", { name: /studio/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Push into studio" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You're signed out of that server.");
    expect(within(alert).queryByRole("button", { name: "Sign in again" })).not.toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /studio/ })).toBeDisabled();
    expect(await screen.findByText(/pushes sessions into it · signed out/)).toBeInTheDocument();

    signedIn = true;
    await user.click(screen.getByRole("button", { name: "Add a team server" }));
    await user.type(screen.getByLabelText("Server address"), "https://192.0.2.20:5174");
    await user.type(screen.getByLabelText("Your token for that server"), "tok");
    (share.login as ReturnType<typeof vi.fn>).mockResolvedValue({ state: "signed-in", origin: "https://192.0.2.20:5174" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Push into studio" }));
    expect(await screen.findByRole("region", { name: "Added to studio" })).toBeInTheDocument();
    expect(share.draftFromBundle).toHaveBeenCalledOnce();
    expect(push).toHaveBeenLastCalledWith("d-1", { hub: "studio", confirm: { sessions: 2, keptFlags: 0 } });
  });

  it("names a login without the needed scope as the destination's refusal, not a signed-out window", async () => {
    const share = fakeShare({
      servers: serving([studio]),
      bundles: vi.fn(async () => [{ ...ready, openFlags: 0 }]),
      draftFromBundle: vi.fn(async () => clean()),
      push: vi.fn().mockRejectedValue(new HttpError(502, "/api/share/drafts/d-1/push", "lacks the memory:import scope", "drop_box", undefined, 403)),
    });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    await user.click(await screen.findByRole("radio", { name: /studio/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Push into studio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That server refused your login there.");
    expect(await screen.findByRole("heading", { name: "Where should it go?" })).toBeInTheDocument();
  });

  it("drops a sent bundle from the list after it leaves", async () => {
    const bundles = vi.fn().mockResolvedValueOnce([{ ...ready, openFlags: 0 }]).mockResolvedValue([]);
    const share = fakeShare({ servers: serving([studio]), bundles, draftFromBundle: vi.fn(async () => clean()), push: vi.fn(async () => ({ hub: "studio", user: "phil", sessions: 2, inserted: 2, skipped: 0 })) });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    await user.click(await screen.findByRole("radio", { name: /studio/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Push into studio" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    expect(await screen.findByText(/No exported bundles are waiting/)).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "retention-nov" })).not.toBeInTheDocument();
  });

  it("keeps an unfinished draft's id when rh can't be asked about it, and checks again on request", async () => {
    sessionStorage.setItem("rivethub.share.draft", "d-1");
    const draft = vi.fn().mockRejectedValueOnce(new NetworkError("/api/share/drafts/d-1", new Error("down"))).mockResolvedValue(flagged("keep"));
    const { user } = renderAt("/share", fakeShare({ draft }));
    expect(await screen.findByRole("region", { name: "Couldn't check your unfinished draft" })).toBeInTheDocument();
    expect(sessionStorage.getItem("rivethub.share.draft")).toBe("d-1");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Resume it" })).toBeInTheDocument();
  });

  it("forgets an unfinished draft only when rh says it is gone and no newer draft took its place", async () => {
    sessionStorage.setItem("rivethub.share.draft", "d-old");
    const gone = new HttpError(404, "/api/share/drafts/d-old", "no draft", "unknown_draft");
    let answer!: (value: never) => void;
    const draft = vi.fn(() => new Promise<DraftReport>((_, reject) => { answer = () => reject(gone); }));
    const share = fakeShare({ draft, bundles: vi.fn(async () => [ready]), draftFromBundle: vi.fn(async () => flagged()) });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    await screen.findByText(/2 flags are still open/);
    answer(undefined as never);
    await waitFor(() => expect(draft).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(sessionStorage.getItem("rivethub.share.draft")!)).toEqual({ id: "d-1", bundle: "retention-nov" });

    cleanup();
    sessionStorage.setItem("rivethub.share.draft", "d-old");
    renderAt("/share", fakeShare({ draft: vi.fn().mockRejectedValue(gone) }));
    await waitFor(() => expect(sessionStorage.getItem("rivethub.share.draft")).toBeNull());
    expect(screen.queryByRole("button", { name: "Resume it" })).not.toBeInTheDocument();
  });

  it("clears the flag notice when a different draft opens", async () => {
    const share = fakeShare({
      bundles: vi.fn(async () => [ready]),
      draftFromBundle: vi.fn(async () => flagged()),
      mark: vi.fn(async () => ({ report: flagged("keep"), rechecked: ["s-1"], learned: "Learned alex as PERSON_1." })),
    });
    const { user } = renderAt("/share", share);
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    for (const n of [1, 2]) await user.click(within(await screen.findByRole("group", { name: `Choice for Flag ${n}` })).getByRole("radio", { name: "Keep" }));
    await user.click(screen.getByRole("button", { name: "Apply 2 choices" }));
    expect(await screen.findByText("Learned alex as PERSON_1. Rechecked: s-1.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    await user.click(await screen.findByRole("button", { name: "Send retention-nov" }));
    await screen.findByText(/2 flags are still open/);
    expect(screen.queryByText(/Learned alex as PERSON_1/)).not.toBeInTheDocument();
  });

  it("leaves cloud out of Settings' team servers when the account says cloud is off", async () => {
    renderAt("/settings/server", fakeShare({ servers: serving([cloud, studio]) }), { account: signedOutCloudOff });
    const team = await screen.findByRole("region", { name: "Team servers" });
    expect(await within(team).findByText("studio")).toBeInTheDocument();
    await waitFor(() => expect(within(team).queryByText("rivethub.cloud")).not.toBeInTheDocument());
  });

  it("offers no cloud account sign-in when cloud is off", async () => {
    renderAt("/settings/account", undefined, { account: signedOutCloudOff });
    expect(await screen.findByText(/RivetHub Cloud is turned off on this hub/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in with your RivetHub account" })).not.toBeInTheDocument();
  });

  it("starts onboarding on GitHub updates with no cloud sign-in when cloud is off", async () => {
    const signIn = vi.fn();
    const update = vi.fn(async () => {});
    const { user } = renderAt("/welcome", undefined, { account: signedOutCloudOff, signIn, updateAccount: update } as Partial<AppClient>);
    expect(await screen.findByRole("radio", { name: /From GitHub, no account/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /From the RivetHub server/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    expect(screen.queryByRole("radio", { name: /From the RivetHub server/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ updateSource: "github" })));
    expect(signIn).not.toHaveBeenCalled();
  });

  it("offers no RivetHub Cloud update source in Account Settings when cloud is off", async () => {
    const githubOff = async () => ({ ...(await signedOutCloudOff()), updateSource: "github" as const });
    renderAt("/settings/account", undefined, { account: githubOff });
    const source = await screen.findByRole("combobox", { name: "Get updates from" });
    expect(within(source).queryByRole("option", { name: /RivetHub server/ })).not.toBeInTheDocument();
    expect(within(source).getByRole("option", { name: "GitHub releases" })).toBeInTheDocument();
  });

  it("describes sending to a team server on Shared when cloud is off", async () => {
    renderAt("/shared", fakeShare(), { account: signedOutCloudOff });
    expect(await screen.findByText(/For a team server you are connected to/)).toBeInTheDocument();
    expect(screen.queryByText(/For a friend, your family/)).not.toBeInTheDocument();
  });
});

describe("Receive", () => {
  const report = (): ReceiveReport => ({
    bundle: "b-1",
    server: "http://127.0.0.1:61522",
    downloaded: true,
    author: "alex",
    node: "alex-laptop",
    verification: "unknown_key",
    reason: "Signed by a key you haven't trusted.",
    signer: { key: "ed25519:BBBB", fingerprint: "SHA256:alexkey" },
    authorFindings: 0,
    authorRows: [],
    summary: "2 sessions, 1 held.",
    held: true,
    sessions: [
      { n: 1, title: "Retention policy", agent: "claude-code", messages: 6, findings: 0, rows: [], secret: false, allowed: ["import", "skip"] },
      {
        n: 2,
        title: "Deploy notes",
        agent: "claude-code",
        messages: 9,
        findings: 1,
        secret: true,
        allowed: ["skip", "hold_spans"],
        rows: [{ field: "tool_result", rule: "aws-key", family: "secret", kind: "secret", count: 1, excerpt: "key >>[SECRET]<< and <U+200B>hidden" }],
      },
    ],
  });
  const result = (): ImportResult => ({
    bundle: "b-1",
    receivedAt: at("2026-11-12T12:00:00Z"),
    author: "alex",
    verification: "unknown_key",
    imported: [
      { n: 1, key: "import:one", verification: "unknown_key", verdict: "clean", inserted: 6, skipped: 0 },
      { n: 2, key: "import:two", verification: "unknown_key", verdict: "hold_spans", inserted: 9, skipped: 0 },
    ],
    skipped: [],
  });

  it("holds flagged sessions for a decision, imports, and says who each came from", async () => {
    const share = fakeShare({ receive: vi.fn(async () => report()), importReceived: vi.fn(async () => result()) });
    const { user } = renderAt("/receive", share);

    const field = await screen.findByLabelText("Paste the code you were sent");
    expect(field).toHaveAttribute("type", "password");
    await user.type(field, CODE);
    await user.click(screen.getByRole("button", { name: "Check the bundle" }));

    expect(await screen.findByText((_, el) => el?.tagName === "P" && el.textContent === "from alex · unverified")).toBeInTheDocument();
    expect(screen.getByLabelText("Excerpt for aws-key")).toHaveTextContent("key >>[SECRET]<< and <U+200B>hidden");
    const flaggedRow = screen.getByRole("listitem", { name: /Session 2/ });
    expect(within(flaggedRow).queryByRole("radio", { name: "Import" })).not.toBeInTheDocument();
    const importButton = screen.getByRole("button", { name: "Import" });
    expect(importButton).toBeDisabled();
    expect(screen.getByText(/1 flagged session needs a decision/)).toBeInTheDocument();

    await user.click(within(flaggedRow).getByRole("radio", { name: "Hold spans" }));
    expect(JSON.stringify({ ...localStorage, ...sessionStorage }) + location.href).not.toContain("TOPSECRETKEY");
    await user.click(importButton);

    await waitFor(() =>
      expect(share.importReceived).toHaveBeenCalledWith(CODE, {
        choices: [
          { n: 1, decision: "import" },
          { n: 2, decision: "hold_spans" },
        ],
      }),
    );
    const imported = await screen.findByRole("list", { name: "Imported sessions" });
    expect(within(imported).getAllByText(/from alex/)).toHaveLength(2);
    expect(within(imported).getByRole("link", { name: "Deploy notes" })).toHaveAttribute("href", "/sessions/import%3Atwo");
    expect(document.body).not.toHaveTextContent("TOPSECRETKEY");
  });

  it("signs in in place when a flagged import needs it, and the import goes through without the code or decisions again", async () => {
    const importReceived = vi.fn().mockRejectedValueOnce(new ReauthRequiredError("/api/share/receive/import")).mockResolvedValue(result());
    const share = fakeShare({ receive: vi.fn(async () => report()), importReceived });
    const { user } = renderAt("/receive", share);
    await user.type(await screen.findByLabelText("Paste the code you were sent"), CODE);
    await user.click(screen.getByRole("button", { name: "Check the bundle" }));
    await user.click(within(await screen.findByRole("listitem", { name: /Session 2/ })).getByRole("radio", { name: "Hold spans" }));
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Confirm it's you first.");
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(await screen.findByText(/Signed in again/)).toBeInTheDocument();
    exchangedOnce();
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByRole("list", { name: "Imported sessions" })).toBeInTheDocument();
    expect(share.receive).toHaveBeenCalledOnce();
    expect(importReceived).toHaveBeenCalledTimes(2);
    expect(importReceived.mock.calls[1]).toEqual([CODE, { choices: [{ n: 1, decision: "import" }, { n: 2, decision: "hold_spans" }] }]);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage }) + location.href).not.toContain("TOPSECRETKEY");
  });

  it("says plainly that a code was already received", async () => {
    const { HttpError } = await import("@rivethub/client");
    const share = fakeShare({ receive: vi.fn().mockRejectedValue(new HttpError(409, "/api/share/receive", "already received", "already_received")) });
    const { user } = renderAt("/receive", share);
    await user.type(await screen.findByLabelText("Paste the code you were sent"), CODE);
    await user.click(screen.getByRole("button", { name: "Check the bundle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You already received this bundle.");
    expect(screen.getByLabelText("Paste the code you were sent")).toBeInTheDocument();
  });
});

describe("Share from a session", () => {
  it("offers Share on the session and arrives with that session found and ticked", async () => {
    const start = "2026-11-11T21:12:00";
    const sample = createSampleClient();
    const row = await sample.session("s-retention" as never);
    const match: ShareableSession = { id: "conv-1", title: row.title, agent: row.harness, first: row.startedAt, last: row.startedAt, messages: row.messageCount, excerpts: [] };
    const find = vi.fn(async () => [found("conv-0", "Something else"), match]);
    void start;
    const { user } = renderAt("/sessions/s-retention", fakeShare({ find }));
    await user.click(await screen.findByRole("link", { name: "Share…" }));
    expect(await screen.findByRole("checkbox", { name: new RegExp(row.title) })).toBeChecked();
    expect(find).toHaveBeenCalledWith({ text: row.title, limit: 25 });
    expect(screen.getByRole("checkbox", { name: /Something else/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
