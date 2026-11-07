import type { Account, HarnessStatus, ModelJob, ModelRole } from "@rivethub/contracts";
import { getRouteApi, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount, useConnectHarness, useHarnesses, useHubs, useLastCrashReport, useModelJobs, useUpdateAccount } from "../client/queries";
import { MobileBack } from "../components/article";
import { Modal } from "../components/modal";
import { Frame, HubList } from "../components/shell";
import { Button, cx, Dot, ErrorNote, Loading, SampleBadge } from "../components/ui";
import { ago, shortDate, time } from "../lib/format";
import { useIsPhone } from "../lib/media";
import type { SettingsSection } from "../router";
import { setTheme, THEMES, useTheme } from "../theme";

const route = getRouteApi("/settings/$section");

const SECTIONS: { id: SettingsSection; label: string; hint: string }[] = [
  { id: "connections", label: "Connections", hint: "Harnesses and models" },
  { id: "account", label: "Account and updates", hint: "Email, updates, privacy" },
  { id: "sharing", label: "Sharing", hint: "People and spaces" },
  { id: "trust", label: "Trust rules", hint: "What skips Review" },
  { id: "appearance", label: "Appearance", hint: "Theme" },
  { id: "server", label: "Server", hint: "Where memory lives" },
];

function SettingsSidebar({ active }: { active: SettingsSection }) {
  return (
    <nav aria-label="Settings" className="flex w-[236px] shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar px-2 py-3">
      <Link to="/" className="px-2.5 py-[7px] text-muted-foreground">‹ Back</Link>
      <span className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">SETTINGS</span>
      {SECTIONS.map((s) => (
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
        {SECTIONS.map((s) => (
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
        return <NotYet what="People and spaces on a team hub, and who can see which sessions." />;
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
  if (h.capture.state === "stale") return { text: `Stopped${when ? ` · ${when}` : ""}`, color: warn };
  return { text: "Not connected", color: dim };
}

function recallLine(h: HarnessStatus): { text: string; color: string } {
  if (h.recall.state === "connected") return { text: "Yes", color: ok };
  if (h.recall.state === "elsewhere") return { text: h.recall.detail, color: dim };
  return { text: "Not connected", color: dim };
}

function harnessAction(h: HarnessStatus): { label: string; part: "capture" | "recall" } | null {
  if (!h.canConnect) return null;
  if (h.capture.state === "stale") return { label: "Fix", part: "capture" };
  if (h.capture.state === "not-connected") return { label: "Connect", part: "capture" };
  if (h.recall.state === "not-connected") return { label: "Connect recall", part: "recall" };
  return null;
}

const roleInfo: Record<ModelRole, { name: string; does: string }> = {
  default: { name: "Default", does: "Used by any job below left on Default." },
  summarizer: { name: "Summarizer", does: "Writes each session summary." },
  categorizer: { name: "Categorizer", does: "Files sessions, suggests tags and tidy." },
  "wiki-writer": { name: "Wiki writer", does: "Writes and updates articles and facts." },
  embedder: { name: "Embedder", does: "Makes search work. Changing it re-indexes." },
};

const healthColor = (j: ModelJob) => (j.health === "healthy" ? ok : j.health === "slow" ? warn : "var(--error)");
const modelLabel = (j: ModelJob, all: ModelJob[]) => {
  if (j.inheritsDefault) {
    const d = all.find((x) => x.role === "default");
    return `Default${d?.model ? ` · ${d.provider} ${d.model}` : ""}`;
  }
  return [j.provider, j.model].filter(Boolean).join(" · ") || "Not set";
};
const jobStatus = (j: ModelJob) => `${j.detail}${j.queued ? ` · ${j.queued} waiting` : ""}`;

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
            rh adds its {part === "capture" ? "hook" : "MCP entry"} to <code className="font-mono text-[12px]">{harness.path ?? harness.capture.detail}</code> only if it is missing, and keeps a backup of the file first. This is the change it will make.
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
  const harnesses = useHarnesses();
  const jobs = useModelJobs();
  const [connecting, setConnecting] = useState<{ h: HarnessStatus; part: "capture" | "recall" } | null>(null);
  if (harnesses.isPending || jobs.isPending) return <Loading />;
  if (harnesses.isError) return <ErrorNote error={harnesses.error} />;
  if (jobs.isError) return <ErrorNote error={jobs.error} />;
  const hs = harnesses.data;
  const js = jobs.data;
  const stale = hs.filter((h) => h.capture.state === "stale");
  const slow = js.filter((j) => j.health !== "healthy");
  const issues = [...stale.map((h) => `${h.name} stopped sending sessions`), ...slow.map((j) => `the ${roleInfo[j.role].name.toLowerCase()} is ${j.health}`)];
  const firstFix = stale.find((h) => h.canConnect);
  const sentence = (list: string[]) => list.map((s, i) => (i === 0 ? s[0]!.toUpperCase() + s.slice(1) : s)).join(", and ");

  const banner = issues.length > 0 && (
    <div className={cx("flex items-center gap-3 rounded-[10px] border px-3.5 py-3", !phone && "flex-wrap")} style={{ borderColor: "color-mix(in srgb, var(--warning) 40%, transparent)", background: "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
      {!phone && <Dot color={warn} />}
      <span className={cx("flex-1 leading-[1.4]", !phone && "min-w-60")}>
        {phone ? "" : "Mostly healthy. "}<b>{issues.length} thing{issues.length === 1 ? "" : "s"} to fix{phone ? "." : ":"}</b> {sentence(issues)}.
      </span>
      {firstFix && <Button variant="primary" size={phone ? "lg" : "md"} className={phone ? "font-semibold" : ""} onClick={() => setConnecting({ h: firstFix, part: "capture" })}>{phone ? "Fix" : `Fix ${firstFix.name}`}</Button>}
    </div>
  );

  return (
    <>
      <SampleBadge capability="harnesses" />
      {banner}
      <section aria-labelledby="harnesses-h" className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2.5">
          <h2 id="harnesses-h" className={cx("m-0 flex-1 font-semibold", phone ? "text-[12px] text-muted-foreground" : "text-[15px]")}>{phone ? "HARNESSES · CAPTURE · RECALL" : "Harnesses"}</h2>
          {!phone && <span className="text-[12px] text-muted-foreground">{hs.filter((h) => h.found).length} found on this machine</span>}
          <Button size="xs" onClick={() => void harnesses.refetch()}>Rescan</Button>
        </div>
        {phone ? (
          <div className="overflow-hidden rounded-[14px] border border-border bg-card">
            {hs.map((h) => {
              const cap = captureLine(h);
              const rec = recallLine(h);
              const action = harnessAction(h);
              return (
                <button key={h.id} type="button" disabled={!action} onClick={() => action && setConnecting({ h, part: action.part })} className="flex min-h-14 w-full items-center gap-2.5 border-0 border-b border-border bg-transparent px-3.5 py-1.5 text-left text-foreground last:border-b-0 disabled:opacity-100">
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{h.name}</span>
                    <span className="text-[12px]" style={{ color: cap.color === warn ? warn : dim }}>
                      {h.capture.state === "receiving" ? "Capturing" : cap.text}
                      {h.recall.state === "connected" ? " · recall on" : ""}
                      {action ? ` · tap to ${action.label.toLowerCase()}` : ""}
                    </span>
                  </span>
                  <span role="img" aria-label={`Capture: ${cap.text}`} className="size-[9px] rounded-full" style={{ background: h.capture.state === "not-connected" ? "var(--input)" : cap.color }} />
                  <span role="img" aria-label={`Recall: ${rec.text}`} className="size-[9px] rounded-full" style={{ background: h.recall.state === "connected" ? ok : "var(--input)" }} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-border">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="bg-sidebar text-[12px] text-muted-foreground">
                  <th scope="col" className="w-[28%] px-3.5 py-2 font-normal">Harness</th>
                  <th scope="col" className="w-[32%] px-3 py-2 font-normal">Capture</th>
                  <th scope="col" className="px-3 py-2 font-normal">Recall</th>
                  <th scope="col" className="w-[130px] px-3.5 py-2"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {hs.map((h) => {
                  const cap = captureLine(h);
                  const rec = recallLine(h);
                  const action = harnessAction(h);
                  return (
                    <tr key={h.id} className="border-t border-border" style={h.capture.state === "stale" ? { background: "color-mix(in srgb, var(--warning) 6%, transparent)" } : undefined}>
                      <th scope="row" className="px-3.5 py-2.5 text-left font-normal">
                        <span className="flex min-w-0 flex-col gap-px">
                          <span className="font-medium">{h.name}</span>
                          <span className="truncate font-mono text-[11px] text-muted-foreground">{h.capture.detail}</span>
                        </span>
                      </th>
                      <td className="px-3 py-2.5 text-[13px]" style={{ color: cap.color }}><span className="flex items-center gap-1.5"><Dot color={cap.color} size={7} />{cap.text}</span></td>
                      <td className="px-3 py-2.5 text-[13px]" style={{ color: rec.color }}><span className="flex items-center gap-1.5"><Dot color={rec.color} size={7} />{rec.text}</span></td>
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
      </section>
      <section aria-labelledby="jobs-h" className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2.5">
          <h2 id="jobs-h" className={cx("m-0 flex-1 font-semibold", phone ? "text-[12px] text-muted-foreground" : "text-[15px]")}>{phone ? "WHO DOES THE WORK" : "Who does the work"}</h2>
          {!phone && <span className="text-[12px] text-muted-foreground">Jobs with no model of their own use Default</span>}
        </div>
        {phone ? (
          <div className="overflow-hidden rounded-[14px] border border-border bg-card">
            {js.filter((j) => j.role !== "default").map((j) => (
              <div key={j.role} className="flex min-h-[52px] items-center gap-2.5 border-b border-border px-3.5 py-1.5 last:border-b-0">
                <span className="flex flex-1 flex-col"><span>{roleInfo[j.role].name}</span><span className="text-[12px] text-muted-foreground">{modelLabel(j, js)}</span></span>
                <span className="text-[12px]" style={{ color: healthColor(j) }}>{j.health === "healthy" ? "OK" : j.health === "slow" ? "Slow" : "Failing"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
            {js.map((j) => (
              <div key={j.role} className="flex flex-col gap-1.5 rounded-[10px] border bg-card p-3" style={{ borderColor: j.health === "healthy" ? "var(--border)" : "color-mix(in srgb, var(--warning) 45%, transparent)" }}>
                <span className="flex items-center justify-between"><span className="font-semibold">{roleInfo[j.role].name}</span><Dot color={healthColor(j)} size={7} /></span>
                <span className="min-h-[34px] text-[12px] leading-[1.4] text-muted-foreground">{roleInfo[j.role].does}</span>
                <span className="rounded-md border border-input bg-background px-2 py-[5px] text-[12px]" style={{ color: j.inheritsDefault ? dim : undefined }}>{modelLabel(j, js)}</span>
                <span className="text-[12px]" style={{ color: healthColor(j) }}>{jobStatus(j)}</span>
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
      <section aria-label="Account" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-selected font-semibold">{(a.email ?? "?")[0]!.toUpperCase()}</span>
        <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
          <span className="font-semibold">{a.email ?? "Not signed in"}</span>
          <span className="text-[12px] text-muted-foreground">{a.email ? "Signed in with an email link · this hub only" : "Updates come from GitHub releases."}</span>
        </span>
      </section>
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
  if (hubs.isPending) return <Loading />;
  if (hubs.isError) return <ErrorNote error={hubs.error} />;
  return (
    <>
      <SampleBadge capability="hubs" />
      <p className="m-0 text-muted-foreground">Each hub keeps its own memory. Open another hub to switch to it.</p>
      <div role="menu" aria-label="Memory hubs" className="flex max-w-xl flex-col gap-1 rounded-xl border border-border bg-card p-1.5">
        <HubList hubs={hubs.data} />
      </div>
      <p className="m-0 text-[13px] text-muted-foreground">Connecting this app to a new hub needs rh's hub pairing, which is not available yet.</p>
    </>
  );
}
