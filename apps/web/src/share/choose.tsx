import { shortDate } from "@rivethub/client-runtime/format";
import type { ShareableSession } from "@rivethub/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useShareClient } from "../client/context";
import { Button, Loading } from "../components/ui";
import { describeFailure } from "./failure";
import { FailureNote, field } from "./ui";

/** Step 1: search the stored sessions and tick the ones to share. */
/** The session the person came from: what to search for, and how to recognize it among the results. */
export interface ShareSeed {
  text: string;
  agent: string;
  startedAt: string;
}

const sameStart = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 2000;

export function Choose({ picked, onToggle, onContinue, seed }: { picked: ShareableSession[]; onToggle: (session: ShareableSession) => void; onContinue: () => void; seed?: ShareSeed }) {
  const share = useShareClient()!;
  const [text, setText] = useState(seed?.text ?? "");
  const [query, setQuery] = useState(seed?.text.trim() ?? "");
  const seeded = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const found = useQuery({ queryKey: ["share", "find", query], queryFn: () => share.find({ text: query, limit: 25 }), enabled: query !== "", retry: false });
  const isPicked = (id: string) => picked.some((s) => s.id === id);
  // Coming from a session, tick it once so the person only has to confirm.
  useEffect(() => {
    if (!seed || seeded.current || !found.data) return;
    seeded.current = true;
    const match = found.data.find((s) => s.agent === seed.agent && sameStart(s.first, seed.startedAt));
    if (match && !picked.some((s) => s.id === match.id)) onToggle(match);
  }, [seed, found.data, picked, onToggle]);
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Find sessions to share</span>
        <input
          type="search"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What was the session about?"
          className={`${field} min-h-10 text-[15px]`}
        />
      </label>

      <div aria-live="polite" className="flex flex-col gap-2">
        {query === "" && picked.length === 0 && (
          <p className="m-0 rounded-xl border border-dashed border-input p-4 text-muted-foreground">Search your memory for the sessions you want to share. Nothing leaves this machine until you confirm at the end.</p>
        )}
        {found.isFetching && <Loading label="Searching" />}
        {found.isError && <FailureNote failure={describeFailure(found.error, "send")} />}
        {found.data && found.data.length === 0 && !found.isFetching && <p className="m-0 p-2 text-muted-foreground">No sessions match “{query}”.</p>}
        {found.data && found.data.length > 0 && (
          <ul aria-label="Matching sessions" className="m-0 flex list-none flex-col gap-1.5 p-0">
            {found.data.map((s) => (
              <SessionOption key={s.id} session={s} checked={isPicked(s.id)} onToggle={() => onToggle(s)} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-3">
        <span aria-live="polite" className="flex-1 text-[13px] text-muted-foreground">
          {picked.length === 0 ? "No sessions chosen." : `${picked.length} ${picked.length === 1 ? "session" : "sessions"} chosen: ${picked.map((s) => s.title ?? "(untitled)").join(", ")}`}
        </span>
        <Button variant="primary" size="md" disabled={picked.length === 0} onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}

function SessionOption({ session, checked, onToggle }: { session: ShareableSession; checked: boolean; onToggle: () => void }) {
  const id = `pick-${session.id}`;
  return (
    <li className="rounded-xl border border-border bg-card">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 p-3">
        <input id={id} type="checkbox" checked={checked} onChange={onToggle} className="mt-1 size-4 accent-primary" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{session.title ?? "(untitled)"}</span>
          <span className="text-[12px] text-muted-foreground">
            {session.agent} · {shortDate(session.last)} · {session.messages} messages{session.importedFrom ? ` · imported from ${session.importedFrom}` : ""}
          </span>
          {session.excerpts.slice(0, 2).map((e, i) => (
            <span key={i} className="truncate text-[12px] text-muted-foreground">{e}</span>
          ))}
        </span>
      </label>
    </li>
  );
}
