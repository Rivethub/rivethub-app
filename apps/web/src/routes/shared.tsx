import { longDay, localDay } from "@rivethub/client-runtime/format";
import type { SessionSummaryRow } from "@rivethub/contracts";
import { Link } from "@tanstack/react-router";
import { useShareClient } from "../client/context";
import { useSessions } from "../client/queries";
import { MobileBack } from "../components/article";
import { Frame, MainSidebar } from "../components/shell";
import { SampleBadge } from "../components/ui";
import { useIsPhone } from "../lib/media";

function bySpace(rows: SessionSummaryRow[]): { space: string; items: SessionSummaryRow[] }[] {
  const out = new Map<string, SessionSummaryRow[]>();
  for (const r of rows) {
    if (r.visibility.kind !== "space" || r.trashed) continue;
    out.set(r.visibility.space, [...(out.get(r.visibility.space) ?? []), r]);
  }
  return [...out].map(([space, items]) => ({ space, items })).sort((a, b) => a.space.localeCompare(b.space));
}

const card = "flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4";

/**
 * Sharing in one place. There are two kinds: a space on this hub, where the
 * people in it see the session where it is, and a bundle sent to another
 * RivetHub, which leaves this machine only after secrets are scrubbed.
 */
export function SharedPage() {
  const phone = useIsPhone();
  const share = useShareClient();
  const list = useSessions({ view: "all" });
  const spaces = bySpace(list.data?.items ?? []);
  return (
    <Frame sidebar={<MainSidebar />}>
      {phone && <MobileBack to="/" label="Today" />}
      <div className="flex justify-center px-4 pb-8 md:px-7 md:py-8">
        <div className="flex min-w-0 max-w-[820px] flex-1 flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 flex items-center gap-2 font-serif text-[28px] font-semibold md:text-[32px]">Shared <SampleBadge capability="sessions" /></h1>
            <p className="m-0 max-w-[62ch] leading-[1.55] text-muted-foreground">
              Everything is private to you until you share it. There are two ways, and you choose per session.
            </p>
          </div>

          <section aria-labelledby="with-space" className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="with-space" className="m-0 text-[15px] font-semibold">With a space on this hub</h2>
              <span className="text-[13px] leading-[1.5] text-muted-foreground">
                People in the space, and their agents, can find the session. It stays where it is, and you can make it private again.
              </span>
            </div>
            {list.isPending ? null : spaces.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-input p-4 text-[13px] leading-[1.5] text-muted-foreground">
                Nothing is shared with a space yet. Open a session and change <span className="text-foreground">Shared with</span> on its right-hand panel.{" "}
                <Link to="/sessions">Open Sessions</Link>
              </p>
            ) : (
              spaces.map((g) => (
                <div key={g.space} className={card}>
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold">{g.space}</span>
                    <span className="text-[12px] text-muted-foreground">{g.items.length} {g.items.length === 1 ? "session" : "sessions"}</span>
                  </span>
                  <ul className="m-0 flex list-none flex-col p-0">
                    {g.items.map((s) => (
                      <li key={s.id}>
                        <Link to="/sessions/$sessionId" params={{ sessionId: s.id }} className="flex items-baseline gap-3 border-t border-border py-2 text-foreground hover:no-underline">
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                          <span className="text-[12px] text-muted-foreground">{longDay(localDay(new Date(s.startedAt))).split(", ").slice(1).join(", ")}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <section aria-labelledby="with-hub" className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="with-hub" className="m-0 text-[15px] font-semibold">With another RivetHub</h2>
              <span className="text-[13px] leading-[1.5] text-muted-foreground">
                For a friend, your family or a team that runs its own. You choose the sessions, secrets are scrubbed on this machine, and you send a one-time code.
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
              <div className={card}>
                <span className="font-semibold">Send sessions</span>
                <span className="flex-1 text-[13px] leading-[1.5] text-muted-foreground">Approve, redact or leave out each session, check what the scrubber flagged, then get a code to pass on privately.</span>
                {share ? <Link to="/share" className="w-fit rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:no-underline">Share sessions</Link> : null}
              </div>
              <div className={card}>
                <span className="font-semibold">Receive sessions</span>
                <span className="flex-1 text-[13px] leading-[1.5] text-muted-foreground">Paste a code someone sent you. You see who it is from and what was held back before anything is imported.</span>
                {share ? <Link to="/receive" className="w-fit rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-accent hover:no-underline">Enter a code</Link> : null}
              </div>
            </div>
            {!share && (
              <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
                Sending and receiving run in the desktop app, next to your own <code className="rounded bg-code px-1 py-px font-mono text-[12px]">rh</code>, so nothing leaves the machine before it is scrubbed.
              </p>
            )}
          </section>
        </div>
      </div>
    </Frame>
  );
}
