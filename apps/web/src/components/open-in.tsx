import { harnessNames, shortDate } from "@rivethub/client-runtime/format";
import type { HarnessStatus, HostOpenSessionRequest, HostOpenSessionResult, SessionDetail } from "@rivethub/contracts";
import { useRef, useState } from "react";
import { desktopBridge } from "../lib/desktop";
import { cx } from "./ui";

interface CopyChoice {
  kind: "copy";
  id: string;
  name: string;
  /** What choosing it does, in a few words. */
  does: string;
  /** What lands on the clipboard. */
  text: string;
  /** Shown under the choice when `text` is a command worth reading. */
  command?: string;
  /** What to do with the copied text. */
  next: string;
}

interface HostChoice {
  kind: "host";
  id: string;
  name: string;
}

type Choice = CopyChoice | HostChoice;

/**
 * A first message for another tool. It names the session the way memory knows it, so the tool's own
 * recall finds it; rh starts no tool itself.
 */
export function handoffPrompt(d: Pick<SessionDetail, "id" | "title" | "harness" | "startedAt">): string {
  const from = harnessNames[d.harness] ?? d.harness;
  return `Pick up where an earlier session left off. It is in RivetHub memory as "${d.title.trim()}" (session ${d.id}, ${from}, ${shortDate(d.startedAt)}). Read it with the memory_search and memory_browse tools, tell me in a few lines where it stopped, then continue the work.`;
}

/**
 * What the host receives for this session. `nativeSessionId` is sent only when the hub sends it;
 * it is never guessed from the resume command.
 */
export function hostOpenRequest(d: SessionDetail): HostOpenSessionRequest {
  const request: HostOpenSessionRequest = {
    sessionId: d.id,
    harness: d.harness,
    title: d.title,
    startedAt: d.startedAt,
    handoffPrompt: handoffPrompt(d),
  };
  if (d.cwd !== undefined) request.cwd = d.cwd;
  if (d.nativeSessionId !== undefined) request.nativeSessionId = d.nativeSessionId;
  if (d.resumeCommand !== undefined) request.resumeCommand = d.resumeCommand;
  return request;
}

export function hostOpenStatus(name: string, result: HostOpenSessionResult): string {
  if (!result.opened) return result.reason;
  return result.how === "resumed" ? `Resumed in ${name}.` : `Continued from memory in ${name}.`;
}

/**
 * The tools this session can be opened in. A host that can open it is first.
 * Then the session's own tool, which resumes it, then every other tool found on this
 * machine that can recall from memory.
 */
export function openChoices(d: SessionDetail, harnesses: HarnessStatus[], hostName?: string | null): Choice[] {
  const own = harnessNames[d.harness] ?? d.harness;
  const out: Choice[] = [];
  if (hostName) out.push({ kind: "host", id: "host", name: hostName });
  if (d.resumeCommand) {
    out.push({ kind: "copy", id: d.harness, name: own, does: "Resume this session", text: d.resumeCommand, command: d.resumeCommand, next: "Paste it in a terminal." });
  }
  for (const harness of harnesses) {
    if (harness.id === d.harness || !harness.found || harness.recall.state !== "connected") continue;
    out.push({ kind: "copy", id: harness.id, name: harness.name, does: "Continue from memory", text: handoffPrompt(d), next: `Paste it as your first message in ${harness.name}.` });
  }
  return out;
}

/** "Open in": the embedding host, when it can open the session, then the tools found on this machine. */
export function OpenIn({ d, harnesses }: { d: SessionDetail; harnesses: HarnessStatus[] }) {
  const host = desktopBridge()?.host;
  const choices = openChoices(d, harnesses, host?.openSession ? host.name : null);
  const [status, setStatus] = useState("");
  const menu = useRef<HTMLDetailsElement>(null);
  if (choices.length === 0) return null;
  const choose = async (choice: Choice) => {
    if (menu.current) menu.current.open = false;
    if (choice.kind === "host") {
      const open = desktopBridge()?.host?.openSession;
      if (!open) {
        setStatus("The host could not open this session.");
        return;
      }
      setStatus(hostOpenStatus(choice.name, await open(hostOpenRequest(d))));
      return;
    }
    try {
      await navigator.clipboard.writeText(choice.text);
    } catch {
      window.prompt(`Copy this for ${choice.name}`, choice.text);
    }
    setStatus(`Copied for ${choice.name}. ${choice.next}`);
  };
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2.5">
      <details ref={menu} className="group/open relative">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground [&::-webkit-details-marker]:hidden">
          Open in
          <span aria-hidden className="transition-transform group-open/open:rotate-180">▾</span>
        </summary>
        <ul role="menu" aria-label="Open in" className="absolute top-full left-0 z-20 m-0 mt-1.5 flex w-[min(360px,80vw)] list-none flex-col gap-0.5 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          {choices.map((choice) => (
            <li key={choice.id} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => void choose(choice)}
                className={cx("flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-selected")}
              >
                <span className="flex w-full items-baseline gap-2">
                  <span className="font-medium">{choice.kind === "host" ? `Open in ${choice.name}` : choice.name}</span>
                  {choice.kind === "copy" && <span className="text-[12px] text-muted-foreground">{choice.does}</span>}
                </span>
                {choice.kind === "copy" && choice.command && <code className="max-w-full font-mono text-[12px] break-all text-muted-foreground">{choice.command}</code>}
              </button>
            </li>
          ))}
        </ul>
      </details>
      <span role="status" className="text-[13px] text-muted-foreground">
        {status}
      </span>
    </div>
  );
}
