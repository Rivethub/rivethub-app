import { ReauthRequiredError } from "@rivethub/client";
import type { DraftReport, ImportResult, IsoTime, ReceiveReport, RivetHubDesktop, ShareClient, ShareableSession } from "@rivethub/contracts";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import { createSampleClient } from "../dev/sample-client";

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
    servers: vi.fn(async () => ({ tokenStore: "file" as const, servers: [{ origin: "http://127.0.0.1:61522", kind: "team" as const, user: "phil", signedIn: true, default: true }] })),
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

function renderAt(path: string, share?: ShareClient) {
  const client = { ...createSampleClient(), ...(share ? { share } : {}) };
  const user = userEvent.setup();
  render(<App client={client} history={createMemoryHistory({ initialEntries: [path] })} />);
  return { user };
}

const bridge = (relogin = vi.fn(async () => {})): RivetHubDesktop => ({ relogin, updates: { getState: vi.fn(), onState: vi.fn(() => () => {}), setChannel: vi.fn(), restartToUpdate: vi.fn() } as never });

beforeEach(() => {
  (window as { rivethub?: RivetHubDesktop }).rivethub = bridge();
});
afterEach(() => {
  delete (window as { rivethub?: RivetHubDesktop }).rivethub;
  sessionStorage.clear();
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
    await user.click(screen.getByRole("checkbox", { name: "Drop tool outputs" }));
    await decide("Backup window", "Approve");
    await decide("Private notes", "Deny");
    expect(share.createDraft).not.toHaveBeenCalled();
    await user.click(confirm);

    await waitFor(() =>
      expect(share.createDraft).toHaveBeenCalledWith([
        { id: "s-1", decision: { kind: "redact", terms: ["alex"], dropToolOutputs: true } },
        { id: "s-2", decision: { kind: "approve" } },
      ]),
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
    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share.send).toHaveBeenCalledWith("d-1", { server: "http://127.0.0.1:61522", signed: true, confirm: { sessions: 2, keptFlags: 1 } }));

    const code = await screen.findByRole("status", { name: "Share code" });
    expect(code).toHaveTextContent(CODE);
    expect(screen.getByText(/Send it in person or in an end-to-end encrypted chat/)).toBeInTheDocument();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage }) + location.href).not.toContain("TOPSECRETKEY");

    await user.click(screen.getByRole("button", { name: /Done, remove the code/ }));
    expect(screen.queryByText(CODE)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("TOPSECRETKEY");
  });

  it("asks for a fresh sign-in when sending needs one, then relogin keeps the draft", async () => {
    const relogin = vi.fn(async () => {});
    (window as { rivethub?: RivetHubDesktop }).rivethub = bridge(relogin);
    const send = vi.fn().mockRejectedValue(new ReauthRequiredError("/api/share/drafts/d-1/send"));
    sessionStorage.setItem("rivethub.share.draft", "d-1");
    const share = fakeShare({ draft: vi.fn(async () => flagged("keep")), send });
    const { user } = renderAt("/share", share);

    await user.click(await screen.findByRole("button", { name: "Resume it" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("radio", { name: /127\.0\.0\.1:61522/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Share" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Confirm it's you first.");
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(relogin).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("rivethub.share.draft")).toBe("d-1");
    expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
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
