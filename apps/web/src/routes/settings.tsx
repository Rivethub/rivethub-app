import { DeviceApproval } from "../components/device-login";
import { ago, shortDate, time } from "@rivethub/client-runtime/format";
import type { Account, HarnessStatus, ModelJob } from "@rivethub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useMe, useAccount, useConnectHarness, useDeleteAccount, useHarnesses, useHubs, useLastCrashReport, useModelJobs, useSignOut, useUpdateAccount } from "../client/queries";
import { MobileBack } from "../components/article";
import { Modal } from "../components/modal";
import { Frame, HubList } from "../components/shell";
import { Button, cx, Dot, ErrorNote, Loading, SampleBadge } from "../components/ui";
import { harnessAction } from "../lib/connections";
import { listSentence } from "../lib/format";
import { describeMemoryRole, memoryRoleStatus } from "../lib/memoryRole";
import { useIsPhone } from "../lib/media";
import { useShareClient } from "../client/context";
import { SERVERS_KEY, shareServerStatus, shareServerTitle, TeamForm } from "../share/destination";
import { ShareKeys } from "../share/keys";
import { useDeviceSignIn } from "../lib/signin";
import type { SettingsSection } from "../router";
import { setTheme, THEMES, useTheme } from "../theme";

const route = getRouteApi("/settings/$section");

const SECTIONS: { id: SettingsSection; label: string; hint: string }[] = [
  { id: "connections", label: "Connections", hint: "Harnesses and models" },
  { id: "account", label: "Account and updates", hint: "Email, updates, privacy" },
  { id: "sharing", label: "Sharing", hint: "People and spaces" },
  { id: "keys", label: "Share keys", hint: "Your key and trusted senders" },
  { id: "trust", label: "Trust rules", hint: "What skips Review" },
  { id: "appearance", label: "Appearance", hint: "Theme" },
  { id: "server", label: "Server", hint: "Where memory lives" },
];

/** Share keys belong to the desktop app, so the section is listed only there. */
function useSections() {
  const sharing = useShareClient() !== null;
  return SECTIONS.filter((s) => s.id !== "keys" || sharing);
}

function SettingsSidebar({ active }: { active: SettingsSection }) {
  return (
    <nav aria-label="Settings" className="flex w-[236px] shrink-0 flex-col gap-0.5 bg-sidebar px-2 py-3">
      <Link to="/" className="px-2.5 py-[7px] text-muted-foreground">‹ Back</Link>
      <span className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">SETTINGS</span>
      {useSections().map((s) => (
        <Link
          key={s.id}
          to="/settings/$section"
          params={{ section: s.id }}
          aria-current={s.id === active ? "page" : undefined}
          className={cx("flex flex-col gap-px rounded-lg px-2.5 py-2 text-foreground hover:no-underline", s.id === active ? "bg-selected" : "hover:bg-accent")}
        >
          <span>{s.label}</span>
          <span className="text-[12px] text-muted-foreground">{s.hint}</span>
        </Link>
      ))}
    </nav>
  );
}

export function SettingsIndex() {
  const phone = useIsPhone();
  if (!phone) return <Navigate to="/settings/$section" params={{ section: "connections" }} replace />;
  return (
    <Frame sidebar={null}>
      <MobileBack to="/" label=""><span /></MobileBack>
      <h1 className="m-0 px-4 pb-2 text-[22px] font-semibold">Settings</h1>
      <div className="mx-4 overflow-hidden rounded-[14px] border border-border bg-card">
        {useSections().map((s) => (
          <Link key={s.id} to="/settings/$section" params={{ section: s.id }} className="flex min-h-[52px] items-center gap-3 border-b border-border px-3.5 text-foreground last:border-b-0 hover:no-underline">
            <span className="flex flex-1 flex-col"><span>{s.label}</span><span className="text-[12px] text-muted-foreground">{s.hint}</span></span>
            <span className="text-muted-foreground">›</span>
          </Link>
        ))}
      </div>
    </Frame>
  );
}

export function SettingsPage() {
  const { section } = route.useParams() as { section: SettingsSection };
  const phone = useIsPhone();
  const meta = SECTIONS.find((s) => s.id === section)!;
  const title = section === "account" ? "Account, updates and privacy" : meta.label;
  const content = (() => {
    switch (section) {
      case "connections":
        return <Connections phone={phone} />;
      case "account":
        return <AccountSettings />;
      case "appearance":
        return <Appearance />;
      case "server":
        return <Server />;
      case "sharing":
        return <SharingSpaces />;
      case "keys":
        return <ShareKeys />;
      case "trust":
        return <NotYet what="Rules that let some proposals skip Review, like always taking the newer session for times on a machine." />;
    }
  })();
  if (phone) {
    return (
      <Frame sidebar={null}>
        <header className="flex items-center gap-1 px-2 pt-2.5 pb-1">
          <MobileBack to="/settings" label="" />
          <h1 className="m-0 -ml-2 flex-1 text-[20px] font-semibold">{meta.label}</h1>
        </header>
        <div className="flex flex-col gap-3.5 px-4 pt-1.5 pb-4 text-[15px]">{content}</div>
      </Frame>
    );
  }
  return (
    <Frame sidebar={<SettingsSidebar active={section} />}>
      <div className="flex justify-center p-7">
        <div className="flex min-w-0 max-w-[960px] flex-1 flex-col gap-[22px]">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[22px] font-semibold">{title}</h1>
            {section === "connections" && <span className="text-muted-foreground">Where memory comes from, who can recall it, and which models do the work.</span>}
          </div>
          {content}
        </div>
      </div>
    </Frame>
  );
}

function NotYet({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-input p-5 text-muted-foreground">
      <p className="m-0 text-foreground">{what}</p>
      <p className="m-0 mt-1.5 text-[13px]">This section arrives when rh exposes it. Nothing here is editable yet.</p>
    </div>
  );
}

// Connections

const ok = "var(--success)";
const warn = "var(--warning)";
const dim = "var(--muted-foreground)";

function captureLine(h: HarnessStatus): { text: string; color: string } {
  const when = h.capture.lastCaptureAt ? ago(h.capture.lastCaptureAt) : "";
  if (h.capture.state === "receiving") return { text: `Yes${when ? ` · ${when}` : ""}`, color: ok };
  // Wired and quiet. Today's hub calls that stale. A hub that stops treating idle as stopped calls it idle.
  if (h.capture.state === "stale" || h.capture.state === "idle") return { text: when ? `Last captured ${when}` : "Ready · nothing captured yet", color: dim };
  return { text: h.capture.state === "not-connected" ? "Not connected" : h.capture.state, color: dim };
}

function recallLine(h: HarnessStatus): { text: string; color: string } {
  if (h.recall.state === "connected") return { text: "Yes", color: ok };
  if (h.recall.state === "elsewhere") return { text: h.recall.detail, color: dim };
  return { text: h.recall.state === "not-connected" ? "Not connected" : h.recall.state, color: dim };
}

/** A job with no model is switched off, not broken: capture and word search work without any model. */
const unset = (j: ModelJob) => j.health === "unconfigured";
const stateColor = (state: string) => (state === "Running" ? ok : state === "No model set" ? dim : state === "Failing" ? "var(--error)" : warn);

const header = (line: string) => line.startsWith("---") || line.startsWith("+++");

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="m-0 max-h-72 overflow-auto rounded-lg bg-code p-3 font-mono text-[12px] leading-[1.6]">
      {diff.split("\n").map((line, i) => (
        <span key={i} className="block" style={{ color: header(line) ? undefined : line.startsWith("+") ? ok : line.startsWith("-") ? "var(--error)" : undefined }}>{line}</span>
      ))}
    </pre>
  );
}

function ConnectDialog({ harness, part, onClose }: { harness: HarnessStatus; part: "capture" | "recall"; onClose: () => void }) {
  const preview = useConnectHarness();
  const apply = useConnectHarness();
  const { mutate: previewIt } = preview;
  useEffect(() => previewIt({ id: harness.id, part, dryRun: true }), [previewIt, harness.id, part]);
  const failed = preview.isError ? preview.error : apply.isError ? apply.error : null;
  const unchanged = preview.data !== undefined && preview.data.diff.trim() === "";
  return (
    <Modal label={`Connect ${harness.name}`} onClose={onClose} className="gap-3 p-5">
      <h2 className="m-0 text-[16px] font-semibold">{part === "capture" ? "Capture" : "Recall"} for {harness.name}</h2>
      {apply.data ? (
        <>
          <p className="m-0 text-muted-foreground">Done. rh changed this file{apply.data.backupPath ? <> and kept a backup at <code className="font-mono text-[12px]">{apply.data.backupPath}</code></> : null}.</p>
          <DiffView diff={apply.data.diff} />
          <span className="flex justify-end"><Button variant="primary" size="md" onClick={onClose}>Close</Button></span>
        </>
      ) : failed ? (
        <>
          <ErrorNote error={failed} />
          <span className="flex justify-end"><Button size="md" onClick={onClose}>Close</Button></span>
        </>
      ) : (
        <>
          <p className="m-0 leading-[1.5] text-muted-foreground">
            rh adds its {part === "capture" ? "hook" : "MCP entry"} to {targetFile(preview.data?.diff) ? <code className="font-mono text-[12px]">{targetFile(preview.data?.diff)}</code> : `${harness.name}'s config`} only if it is missing, and keeps a backup of the file first. This is the change it will make.
          </p>
          {preview.data ? <DiffView diff={unchanged ? "Nothing to change. It is already set up." : preview.data.diff} /> : <Loading />}
          <span className="flex justify-end gap-2">
            <Button size="md" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="md" disabled={!preview.data || unchanged || apply.isPending} onClick={() => apply.mutate({ id: harness.id, part })}>
              {apply.isPending ? "Connecting…" : "Connect"}
            </Button>
          </span>
        </>
      )}
    </Modal>
  );
}

export function Connections({ phone }: { phone: boolean }) {
  const harnesses = useHarnesses(true);
  const jobs = useModelJobs(true);
  const [connecting, setConnecting] = useState<{ h: HarnessStatus; part: "capture" | "recall" } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  // The query library refetches when the page becomes visible. A desktop window that was only behind
  // another one stays visible, so coming back to it is a focus event.
  const refetchHarnesses = harnesses.refetch;
  const refetchJobs = jobs.refetch;
  useEffect(() => {
    const refresh = () => {
      void refetchHarnesses();
      void refetchJobs();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refetchHarnesses, refetchJobs]);
  async function rescan() {
    setScanning(true);
    try {
      const result = await harnesses.refetch();
      if (!result.isError) setScannedAt(Date.now());
    } finally {
      setScanning(false);
    }
  }
  if (harnesses.isPending || jobs.isPending) return <Loading />;
  if (harnesses.isError) return <ErrorNote error={harnesses.error} />;
  if (jobs.isError) return <ErrorNote error={jobs.error} />;
  const every = harnesses.data;
  // Lead with the tools that are on this machine or already wired up. The rest stay one click away.
  const here = every.filter((h) => h.found || h.canConnect || h.capture.state !== "not-connected" || h.recall.state === "connected");
  const hs = showAll || here.length === 0 ? every : here;
  const hidden = every.length - hs.length;
  const js = jobs.data;
  const readings = js.map((job) => describeMemoryRole(job, js));
  const actionable = hs.flatMap((h) => {
    const action = harnessAction(h);
    return action ? [{ h, action }] : [];
  });
  const trouble = readings.filter((reading) => reading.state !== "Running" && reading.state !== "No model set");
  const issues = [
    ...actionable.map(({ h, action }) => action.part === "recall" ? `${h.name} recall is not connected` : `${h.name} is not connected`),
    ...trouble.map((reading) => `the ${reading.name.toLowerCase()} is ${reading.state.toLowerCase()}`),
  ];
  const firstFix = actionable[0];
  const issueText = listSentence(issues);

  const banner = issues.length > 0 && (
    <div className={cx("flex items-center gap-3 rounded-[10px] border px-3.5 py-3", !phone && "flex-wrap")} style={{ borderColor: "color-mix(in srgb, var(--warning) 40%, transparent)", background: "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
      {!phone && <Dot color={warn} />}
      <span className={cx("flex-1 leading-[1.4]", !phone && "min-w-60")}>
        {!phone && issues.length === 1 ? "Mostly healthy. " : ""}<b>{issues.length} thing{issues.length === 1 ? "" : "s"} to fix{phone ? "." : ":"}</b> {issueText[0]!.toUpperCase() + issueText.slice(1)}.
      </span>
      {firstFix && <Button variant="primary" size={phone ? "lg" : "md"} className={phone ? "font-semibold" : ""} aria-label={`${firstFix.action.label} ${firstFix.h.name}`} onClick={() => setConnecting({ h: firstFix.h, part: firstFix.action.part })}>{phone ? firstFix.action.label : `${firstFix.action.label} ${firstFix.h.name}`}</Button>}
    </div>
  );

  return (
    <>
      <SampleBadge capability="harnesses" />
      {banner}
      <section aria-labelledby="harnesses-h" className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2.5">
          <h2 id="harnesses-h" className={cx("m-0 flex-1 font-semibold", phone ? "text-[12px] text-muted-foreground" : "text-[15px]")}>{phone ? "HARNESSES · CAPTURE · RECALL" : "Harnesses"}</h2>
          {!phone && <span className="text-[12px] text-muted-foreground">{every.filter((h) => h.found).length} found on this machine</span>}
          {scannedAt !== null && <span className="text-[12px] text-muted-foreground">Scanned {ago(new Date(scannedAt).toISOString())}</span>}
          <Button size="xs" disabled={scanning} onClick={() => void rescan()}>{scanning ? "Scanning…" : "Rescan"}</Button>
        </div>
        {phone ? (
          <div className="overflow-hidden rounded-[14px] border border-border bg-card">
            {hs.map((h) => {
              const cap = captureLine(h);
              const rec = recallLine(h);
              const action = harnessAction(h);
              return (
                <button key={h.id} type="button" disabled={!action} onClick={() => action && setConnecting({ h, part: action.part })} className="flex min-h-14 w-full items-center gap-2.5 border-0 border-b border-border bg-transparent px-3.5 py-1.5 text-left text-foreground last:border-b-0 disabled:opacity-100">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{h.name}</span>
                    <span className="text-[12px]" style={{ color: cap.color === warn ? warn : dim }}>
                      {h.capture.state === "receiving" ? "Capturing" : cap.text}
                      {h.recall.state === "connected" ? " · recall on" : ""}
                      {action ? ` · tap to ${action.label.toLowerCase()}` : ""}
                    </span>
                    <span title={h.capture.detail} className="truncate font-mono text-[11px] text-muted-foreground">{h.capture.detail}</span>
                  </span>
                  <span role="img" aria-label={`Capture: ${cap.text}`} className="size-[9px] rounded-full" style={{ background: h.capture.state === "not-connected" ? "var(--input)" : cap.color }} />
                  <span role="img" aria-label={`Recall: ${rec.text}`} className="size-[9px] rounded-full" style={{ background: h.recall.state === "connected" ? ok : "var(--input)" }} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-border">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
              <thead>
                <tr className="bg-sidebar text-[12px] text-muted-foreground">
                  <th scope="col" className="px-3.5 py-2 font-normal">Harness</th>
                  <th scope="col" className="w-[240px] px-3 py-2 font-normal">Capture</th>
                  <th scope="col" className="w-[150px] px-3 py-2 font-normal">Recall</th>
                  <th scope="col" className="w-[150px] px-3.5 py-2"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {hs.map((h) => {
                  const cap = captureLine(h);
                  const rec = recallLine(h);
                  const action = harnessAction(h);
                  return (
                    <tr key={h.id} className="border-t border-border">
                      <th scope="row" className="px-3.5 py-2.5 text-left font-normal">
                        <span className="flex min-w-0 flex-col gap-px">
                          <span className="font-medium">{h.name}</span>
                          <span title={h.capture.detail} className="truncate font-mono text-[11px] text-muted-foreground">{h.capture.detail}</span>
                        </span>
                      </th>
                      <td className="px-3 py-2.5 text-[13px]" style={{ color: cap.color }}><span className="flex flex-wrap items-center gap-1.5"><Dot color={cap.color} size={7} /><span className="whitespace-nowrap">{cap.text}</span></span></td>
                      <td className="px-3 py-2.5 text-[13px]" style={{ color: rec.color }}><span className="flex flex-wrap items-center gap-1.5"><Dot color={rec.color} size={7} /><span className={h.recall.state === "elsewhere" ? "min-w-0 break-words" : "whitespace-nowrap"}>{rec.text}</span></span></td>
                      <td className="px-3.5 py-2.5 text-right">
                        {action && <Button variant="primary" size="md" aria-label={`${action.label} ${h.name}`} onClick={() => setConnecting({ h, part: action.part })}>{action.label}</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!phone && <span className="text-[12px] text-muted-foreground">Connect adds rh's hook and MCP entry only if they are missing, shows the change, and keeps a backup.</span>}
        {(hidden > 0 || (showAll && here.length > 0 && here.length < every.length)) && (
          <button type="button" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} className="w-fit border-0 bg-transparent p-0 text-[13px] text-info hover:underline">
            {showAll ? "Show only the tools on this machine" : `Show ${hidden} more ${hidden === 1 ? "tool" : "tools"} RivetHub can capture from`}
          </button>
        )}
      </section>
      <section aria-labelledby="jobs-h" className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2.5">
          <h2 id="jobs-h" className={cx("m-0 flex-1 font-semibold", phone ? "text-[12px] text-muted-foreground" : "text-[15px]")}>{phone ? "WHO DOES THE WORK" : "Who does the work"}</h2>
        </div>
        <p className="m-0 text-[12px] text-muted-foreground">Set in the hub's configuration, under <code className="font-mono">memory.models</code>. This screen cannot change them.</p>
        {js.every(unset) && (
          <p className="m-0 max-w-[70ch] rounded-xl border border-dashed border-input p-4 text-[13px] leading-[1.55] text-muted-foreground">
            <span className="font-semibold text-foreground">No model is set.</span> Capture, the session list and word search work without one. Summaries, topics, entities and the wiki need a chat model, and search by meaning needs an embedding model; both can run on this machine. Set them under <code className="rounded bg-code px-1 py-px font-mono text-[12px]">memory.models</code> in <code className="rounded bg-code px-1 py-px font-mono text-[12px]">~/.rivethub/config.yaml</code>, then restart <code className="rounded bg-code px-1 py-px font-mono text-[12px]">rh</code>.
          </p>
        )}
        {phone ? (
          <div className="overflow-hidden rounded-[14px] border border-border bg-card">
            {readings.filter((reading) => reading.role !== "default").map((reading) => (
              <div key={reading.role} className="flex min-h-[52px] items-center gap-2.5 border-b border-border px-3.5 py-1.5 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{reading.name}</span>
                  <span className="break-words text-[12px] text-muted-foreground">{reading.modelLine}</span>
                  <span className="text-[12px]" style={{ color: stateColor(reading.state) }}>{memoryRoleStatus(reading)}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
            {readings.map((reading) => (
              <div key={reading.role} className="flex flex-col gap-1.5 rounded-[10px] border bg-card p-3" style={{ borderColor: reading.state === "Running" || reading.state === "No model set" ? "var(--border)" : "color-mix(in srgb, var(--warning) 45%, transparent)" }}>
                <span className="flex items-center justify-between"><span className="font-semibold">{reading.name}</span><Dot color={stateColor(reading.state)} size={7} /></span>
                <span className="break-words text-[13px]">{reading.modelLine}</span>
                <span className="text-[12px]" style={{ color: stateColor(reading.state) }}>{memoryRoleStatus(reading)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      {connecting && <ConnectDialog harness={connecting.h} part={connecting.part} onClose={() => setConnecting(null)} />}
    </>
  );
}

// Account

function Row({ label, hint, children }: { label: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="flex min-w-[200px] flex-1 flex-col gap-0.5"><span>{label}</span><span className="text-[12px] text-muted-foreground">{hint}</span></span>
      {children}
    </div>
  );
}

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="flex flex-1 flex-col gap-0.5"><span>{label}</span><span className="text-[12px] leading-[1.45] text-muted-foreground">{hint}</span></span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-primary" />
    </label>
  );
}

function AccountCard({ account }: { account: Account }) {
  const signIn = useDeviceSignIn();
  const signOut = useSignOut();
  const failure = signIn.state.phase === "failed" ? signIn.state.error : signOut.error;
  const waiting = signIn.state.phase === "waiting" || signIn.state.phase === "starting";
  return (
    <section aria-label="Account" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-selected font-semibold">{(account.email ?? "?")[0]!.toUpperCase()}</span>
        <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
          <span className="font-semibold">{account.email ?? "Not signed in"}</span>
          <span className="text-[12px] text-muted-foreground">{account.email ? "Signed in with your RivetHub account" : "Updates come from GitHub releases."}</span>
        </span>
        {account.email && (
          <Button disabled={signOut.isPending} onClick={() => signOut.mutate()}>Sign out</Button>
        )}
      </div>
      {!account.email && (
        <div className="flex flex-col items-start gap-3">
          <DeviceApproval state={signIn.state} />
          {waiting ? <Button onClick={signIn.cancel}>Cancel</Button> : <Button variant="primary" onClick={() => void signIn.start()}>Sign in with your RivetHub account</Button>}
        </div>
      )}
      {failure !== undefined && failure !== null && <ErrorNote error={failure} />}
    </section>
  );
}

function DangerZone({ signedIn }: { signedIn: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteAccount = useDeleteAccount();
  const accountUrl = deleteAccount.data?.accountUrl;
  if (!signedIn) {
    // The node is signed out; the account itself is deleted in the cloud, so the link has to outlive the sign-out.
    if (!accountUrl) return null;
    return (
      <section aria-label="Finish deleting your account" className="flex flex-col gap-2 rounded-xl border border-error/40 p-4">
        <p className="m-0 text-error">This node is signed out. Your account still exists until you delete it in your cloud account settings.</p>
        <a href={accountUrl} target="_blank" rel="noreferrer" className="text-error" style={{ color: "var(--error)" }}>Open cloud account settings to delete your account</a>
      </section>
    );
  }
  return (
    <section aria-labelledby="danger-h" className="flex flex-col gap-3">
      <h2 id="danger-h" className="m-0 text-[15px] font-semibold text-error">Danger</h2>
      <div className="flex flex-col gap-3 rounded-xl border border-error/40 p-4">
        <p className="m-0 text-error">Don't click here unless you really wanted to delete your account.</p>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-[13px] text-error">Sign this node out, then open your cloud account to delete it there. Your memory stays on this hub.</span>
            <Button variant="danger" disabled={deleteAccount.isPending} onClick={() => deleteAccount.mutate(undefined, { onSettled: () => setConfirmDelete(false) })}>Sign this node out</Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete account…</Button>
        )}
        <a href={accountUrl ?? "https://rivethub.cloud/account"} target="_blank" rel="noreferrer" className="text-error" style={{ color: "var(--error)" }}>Open cloud account settings to delete your account</a>
        {deleteAccount.error != null && <ErrorNote error={deleteAccount.error} />}
      </div>
    </section>
  );
}

const selectCls = "rounded-lg border border-input bg-card px-2 py-1 text-[13px] text-foreground";

function AccountSettings() {
  const account = useAccount();
  const crash = useLastCrashReport();
  const update = useUpdateAccount();
  if (account.isPending) return <Loading />;
  if (account.isError) return <ErrorNote error={account.error} />;
  const a = account.data;
  const set = (patch: Partial<Pick<Account, "channel" | "autoDownload" | "crashReports" | "usageCounts" | "updateSource">>) => update.mutate(patch);
  return (
    <>
      <SampleBadge capability="account" />
      <AccountCard account={a} />
      <section aria-labelledby="updates-h" className="flex flex-col gap-3">
        <h2 id="updates-h" className="m-0 text-[15px] font-semibold">Updates</h2>
        {a.pendingUpdate && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3.5" style={{ borderColor: "color-mix(in srgb, var(--info) 40%, transparent)", background: "color-mix(in srgb, var(--info) 8%, transparent)" }}>
            <span className="flex min-w-60 flex-1 flex-col gap-0.5">
              <span className="font-semibold">{a.pendingUpdate.version} is ready</span>
              <span className="text-[13px] text-muted-foreground">Downloaded and signature checked. Applies when rh restarts. <a href={a.pendingUpdate.notesUrl} target="_blank" rel="noreferrer">What's new</a></span>
            </span>
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-border">
          <Row label="Version" hint="rh and this app update together"><span className="text-[13px]">{a.version}</span></Row>
          <Row label="Get updates from" hint="Switch to GitHub releases any time">
            <select aria-label="Get updates from" value={a.updateSource} onChange={(e) => set({ updateSource: e.target.value as Account["updateSource"] })} className={selectCls}>
              <option value="rivethub-cloud">RivetHub server</option>
              <option value="github">GitHub releases</option>
            </select>
          </Row>
          <Row label="Channel" hint="Beta gets new features a week early">
            <select aria-label="Channel" value={a.channel} onChange={(e) => set({ channel: e.target.value as Account["channel"] })} className={selectCls}>
              <option value="stable">Stable</option>
              <option value="beta">Beta</option>
            </select>
          </Row>
          <Switch label="Download automatically" hint="New versions download in the background and apply on restart." checked={a.autoDownload} onChange={(v) => set({ autoDownload: v })} />
        </div>
      </section>
      <section aria-labelledby="privacy-h" className="flex flex-col gap-3">
        <h2 id="privacy-h" className="m-0 text-[15px] font-semibold">Privacy</h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <Switch label="Send crash reports" hint="Stack trace, rh version, OS and which job failed. Never memory content, names, paths, tokens or your email." checked={a.crashReports} onChange={(v) => set({ crashReports: v })} />
          <Switch label="Send anonymous usage counts" hint="Numbers only, like sessions captured per day, to see what to improve." checked={a.usageCounts} onChange={(v) => set({ usageCounts: v })} />
        </div>
        <div className="flex flex-col overflow-hidden rounded-xl border border-border">
          <div className="flex items-center bg-sidebar px-4 py-2.5">
            <span className="flex-1 font-medium">Last crash report</span>
            {crash.data && <span className="text-[12px] text-muted-foreground">{shortDate(crash.data.sentAt)}, {time(crash.data.sentAt)} · sent</span>}
          </div>
          {crash.data ? (
            <>
              <pre className="m-0 overflow-x-auto bg-code px-4 py-3 font-mono text-[12px] leading-[1.6]">{JSON.stringify(crash.data.report, null, 2)}</pre>
              <span className="px-4 py-2 text-[12px] text-muted-foreground">This is everything that was sent. Reports are checked by the same scrubber every build is tested against.</span>
            </>
          ) : (
            <span className="px-4 py-3 text-[13px] text-muted-foreground">{crash.isPending ? "Loading…" : "No crash reports have been sent from this hub."}</span>
          )}
        </div>
        <span className="text-[12px] text-muted-foreground">On a team hub, the hub's admin can turn reporting off for everyone.</span>
      </section>
      <DangerZone signedIn={!!a.email} />
    </>
  );
}

function Appearance() {
  const theme = useTheme();
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-3 text-muted-foreground">Pick a theme. It is saved in this browser.</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {THEMES.map((t) => (
          <label key={t.id} className={cx("flex cursor-pointer flex-col gap-2.5 rounded-xl border p-3", theme === t.id ? "border-2 border-primary" : "border-border")}>
            <span data-theme={t.id} aria-hidden="true" className="flex h-16 gap-1.5 overflow-hidden rounded-lg border border-border p-2" style={{ background: "var(--background)" }}>
              <span className="w-8 rounded" style={{ background: "var(--sidebar)" }} />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="h-2 w-2/3 rounded" style={{ background: "var(--foreground)" }} />
                <span className="h-2 w-1/2 rounded" style={{ background: "var(--muted-foreground)" }} />
                <span className="h-3 w-10 rounded" style={{ background: "var(--primary)" }} />
              </span>
            </span>
            <span className="flex items-center gap-2">
              <input type="radio" name="theme" value={t.id} checked={theme === t.id} onChange={() => setTheme(t.id)} className="accent-primary" />
              <span className="flex flex-col"><span className="font-medium">{t.label}</span><span className="text-[12px] text-muted-foreground">{t.hint}</span></span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Server() {
  const hubs = useHubs();
  const me = useMe();
  const share = useShareClient();
  const qc = useQueryClient();
  const [teamFailure, setTeamFailure] = useState<string | null>(null);
  const servers = useQuery({ queryKey: SERVERS_KEY, queryFn: () => share!.servers(), enabled: share !== null, retry: false });
  if (hubs.isPending) return <Loading />;
  if (hubs.isError) return <ErrorNote error={hubs.error} />;
  const current = hubs.data.find((hub) => hub.current);
  const spaces = me.data?.spaces ?? [];
  const others = hubs.data.filter((hub) => !hub.current);
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <SampleBadge capability="hubs" />
      <section aria-labelledby="this-node" className="flex flex-col gap-1.5">
        <h2 id="this-node" className="m-0 text-[15px] font-semibold">This node</h2>
        <p className="m-0">{current ? current.name : "This window is not connected to a hub."}</p>
        <p className="m-0 text-[13px] text-muted-foreground">
          {me.isPending ? "Loading spaces…" : spaces.length ? `Spaces on this node: ${spaces.map((space) => space.name).join(", ")}` : "You are not in a space on this node."}
        </p>
      </section>
      {others.length > 0 && (
        <div role="menu" aria-label="Memory hubs" className="flex flex-col gap-1 rounded-xl border border-border bg-card p-1.5">
          <HubList hubs={others} />
        </div>
      )}
      <section aria-labelledby="team-servers" className="flex flex-col gap-2">
        <h2 id="team-servers" className="m-0 text-[15px] font-semibold">Team servers</h2>
        <p className="m-0 text-[13px] text-muted-foreground">A team server connection sends and receives shared sessions. It does not switch this window.</p>
        {share ? (
          <>
            {servers.isPending && <Loading label="Loading servers" />}
            {servers.isError && <ErrorNote error={servers.error} />}
            {servers.data && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {servers.data.servers.map((server) => (
                  <li key={server.origin} className="flex flex-col rounded-lg border border-border px-3 py-2">
                    <span className="font-medium">{shareServerTitle(server)}</span>
                    <span className="text-[12px] text-muted-foreground">{shareServerStatus(server)}</span>
                  </li>
                ))}
                {servers.data.servers.length === 0 && <li className="text-muted-foreground">No share servers are set up.</li>}
              </ul>
            )}
            {teamFailure && <p role="alert" className="m-0 text-error">{teamFailure}</p>}
            <TeamForm
              onSignedIn={() => {
                setTeamFailure(null);
                void qc.invalidateQueries({ queryKey: SERVERS_KEY });
              }}
              onFail={(error) => setTeamFailure(error instanceof Error ? error.message : "Could not sign in to that team server.")}
            />
          </>
        ) : (
          <p className="m-0 text-[13px] text-muted-foreground">Adding a team server is in the RivetHub desktop app.</p>
        )}
      </section>
    </div>
  );
}

function targetFile(diff: string | undefined): string | undefined {
  const line = diff?.split("\n").find((l) => l.startsWith("+++ "));
  return line?.replace(/^\+\+\+ (b\/)?/, "").trim() || undefined;
}

function SharingSpaces() {
  const me = useMe();
  if (me.isPending) return <Loading label="Loading spaces" />;
  if (me.isError) return <p role="alert">Spaces could not be read from the hub.</p>;
  return <section><h2>Your spaces</h2>{me.data?.spaces.length ? <ul>{me.data.spaces.map((s) => <li key={s.id}>{s.name}</li>)}</ul> : <p>Sessions are private. Spaces are set up on the hub.</p>}</section>;
}
