import { splitInjected } from "@rivethub/client";
import { groupSummary, replyMeta, thoughtSummary, toolCategory, toolLabel, verdict, type Exchange, type Step, type ToolCategory, type ToolPart } from "@rivethub/client-runtime/exchange";
import { time } from "@rivethub/client-runtime/format";
import type { SessionId, TranscriptTurn } from "@rivethub/contracts";
import { useState, type ReactNode, type Ref } from "react";
import { useToolOutput } from "../client/queries";
import { Markdown } from "./markdown";
import { cx } from "./ui";

/** How many lines of a tool's answer show before the rest is folded away, counted from the end. */
const BODY_LINES = 40;

const GLYPH: Record<ToolCategory, string> = { read: "▤", search: "⌕", edit: "✎", command: "❯", web: "◎", subagent: "⑂", tool: "◇" };

const fold = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

/** `steps` is the fold around an exchange's steps; the folds inside it turn on their own. */
function Chevron({ steps }: { steps?: boolean }) {
  return <span aria-hidden className={cx("inline-block w-4 flex-none text-center transition-transform", steps ? "group-open/steps:rotate-90" : "group-open/fold:rotate-90")}>›</span>;
}

/** A small text button that says "Copied" for a moment. */
export function Copy({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx("rounded px-1 hover:text-foreground", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt(label, text);
        }
      }}
    >
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

/** The person's prompt: a bubble on the right, with what the tool added around it folded away under it. */
function Prompt({ turn, sender }: { turn: TranscriptTurn; sender: string | undefined }) {
  const pieces = turn.parts.flatMap((part) => (part.kind === "text" ? splitInjected(part.text) : []));
  const said = pieces.filter((piece) => piece.kind === "said");
  const injected = pieces.filter((piece) => piece.kind === "injected");
  const clock = new Date(turn.at).getTime() > 0 ? time(turn.at) : "";
  return (
    <div id={`m${turn.index}`} className="group/sent flex w-full scroll-mt-4 flex-col items-end gap-2">
      {sender && said.length > 0 && <span className="text-[11px] text-muted-foreground">{sender}</span>}
      {said.map((piece, i) => (
        <div key={i} className="flex w-full items-end justify-end gap-2">
          <span className="flex flex-none items-center gap-2 pb-1.5 text-[12px] text-muted-foreground opacity-0 focus-within:opacity-100 group-hover/sent:opacity-100">
            <Copy text={piece.text} label="Copy" />
            {clock}
          </span>
          <p className="m-0 min-w-0 max-w-[70%] rounded-[20px] bg-message-surface px-4 py-2.5 leading-[1.55] whitespace-pre-wrap [overflow-wrap:anywhere]">{piece.text}</p>
        </div>
      ))}
      {injected.map((piece, i) => (
        <details key={i} className="w-full min-w-0 rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground">
          <summary className="cursor-pointer">Context: {piece.kind === "injected" ? piece.tag.replace(/[_-]/g, " ") : ""}</summary>
          <pre className="m-0 mt-2 font-mono break-words whitespace-pre-wrap">{piece.text}</pre>
        </details>
      ))}
    </div>
  );
}

function tail(text: string): string {
  const lines = text.replace(/\s+$/, "").split("\n");
  const skipped = lines.length - BODY_LINES;
  return skipped > 0 ? [`… ${skipped} earlier lines`, ...lines.slice(skipped)].join("\n") : lines.join("\n");
}

/** What a tool was called with, as a person would type or read it. */
function asked(tool: ToolPart): string {
  const input = tool.input;
  if (!input || Object.keys(input).length === 0) return "";
  const command = input.command ?? input.cmd;
  if (toolCategory(tool.name) === "command" && typeof command === "string") return command;
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

/**
 * One tool call. Opened, it shows what the tool was asked and what it answered; an answer the transcript
 * did not carry is read from the hub then, which has it only on the machine that ran the session.
 */
function ToolRow({ tool, session }: { tool: ToolPart; session: SessionId }) {
  const [opened, setOpened] = useState(false);
  const input = asked(tool);
  const fetchable = tool.result === undefined && tool.id !== undefined && tool.status !== "running";
  const fetched = useToolOutput(session, tool.id ?? "", opened && fetchable);
  const result = (tool.result ?? fetched.data?.text ?? "").trim();
  const label = toolLabel(tool);
  const head = (
    <>
      <span aria-hidden className="w-4 flex-none text-center">{GLYPH[toolCategory(tool.name)]}</span>
      <span className="flex-none font-medium">{tool.name}</span>
      {label !== tool.name && <span className="min-w-0 truncate font-mono text-[12px]" title={label}>{label}</span>}
      <span className="flex-1" />
      {tool.status === "error" && <span className="flex-none text-[12px] text-warning">failed</span>}
      {tool.status === "running" && <span className="flex-none text-[12px]">running</span>}
    </>
  );
  const row = "flex min-h-6 items-center gap-1.5 pl-[22px] text-[13px] text-muted-foreground";
  if (input === "" && result === "" && !fetchable) return <div className={row}>{head}</div>;
  const note = "px-3 py-2 font-sans text-muted-foreground";
  return (
    <details className="group/tool" onToggle={(event) => setOpened(event.currentTarget.open)}>
      <summary className={cx(row, fold, "hover:text-foreground")}>{head}</summary>
      <div className="mt-1 mb-1.5 ml-[22px] flex flex-col gap-px overflow-hidden rounded-lg border border-border font-mono text-[12px] leading-[18px]">
        {input !== "" && <pre className="m-0 max-h-80 overflow-auto bg-code px-3 py-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{input}</pre>}
        {result !== "" && <pre className="m-0 max-h-96 overflow-auto px-3 py-2 text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{tail(result)}</pre>}
        {fetchable && fetched.isPending && opened && <span className={note}>Reading the output…</span>}
        {fetchable && fetched.isError && <span className={note}>The output could not be read. It is kept in the tool's own files, which may be on another machine.</span>}
        {fetchable && fetched.isSuccess && result === "" && <span className={note}>The tool gave no output.</span>}
        {fetched.data?.truncated && <span className={note}>Only part of a long output is shown.</span>}
      </div>
    </details>
  );
}

function StepView({ step, session }: { step: Step; session: SessionId }) {
  const line = "flex h-6 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground";
  if (step.kind === "thought") {
    const summary = thoughtSummary(step.text);
    return (
      <details className="group/fold">
        <summary className={cx(line, fold)}>
          <Chevron />
          <span className="flex-none">Think</span>
          {summary !== "" && <><span aria-hidden>·</span><span className="min-w-0 truncate">{summary}</span></>}
        </summary>
        <p className="m-0 py-1 pl-[22px] text-[13px] leading-[1.55] text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">{step.text.trim()}</p>
      </details>
    );
  }
  if (step.kind === "note") return <Markdown source={step.text} className="gap-2 pl-[22px] text-[13px] text-muted-foreground [overflow-wrap:anywhere]" />;
  return (
    <details className="group/fold">
      <summary className={cx(line, fold)}>
        <Chevron />
        <span className="min-w-0 truncate">{groupSummary(step.tools)}</span>
      </summary>
      <div className="flex flex-col">{step.tools.map((tool, i) => <ToolRow key={i} tool={tool} session={session} />)}</div>
    </details>
  );
}

/**
 * One prompt and its answer, laid out as a chat: the prompt on the right, the agent's steps folded under a
 * line that says how long it took, then the reply as formatted text. `open` unfolds the steps, as a link
 * from the summary into these messages does.
 */
export function ExchangeView({ exchange, session, sender, hit, open, anchor }: { exchange: Exchange; session: SessionId; sender: string | undefined; hit: boolean; open: boolean; anchor: Ref<HTMLElement> | undefined }) {
  const { prompt, steps, answer } = exchange;
  const meta = replyMeta(exchange);
  const ended = exchange.endedAt && new Date(exchange.endedAt).getTime() > 0 ? time(exchange.endedAt) : "";
  const quiet = prompt !== undefined && steps.length === 0 && answer.trim() === "" && prompt.parts.some((part) => part.kind === "text" && splitInjected(part.text).some((piece) => piece.kind === "said"));
  const actions: ReactNode[] = [
    answer.trim() !== "" ? <Copy key="copy" text={answer.trim()} label="Copy reply" /> : null,
    ended !== "" ? <span key="at">{ended}</span> : null,
    meta !== "" ? <span key="meta" className="min-w-0 truncate">{meta}</span> : null,
  ].filter(Boolean);
  return (
    <section
      ref={anchor}
      aria-label={prompt ? "Prompt and reply" : "Reply"}
      className={cx("group/exchange relative flex scroll-mt-4 flex-col gap-3 py-3", hit && "rounded-lg border-l-2 border-primary pl-2.5")}
      style={hit ? { background: "color-mix(in srgb, var(--primary) 6%, transparent)" } : undefined}
    >
      {prompt && <Prompt turn={prompt} sender={sender} />}
      {exchange.replies.map((turn) => <span key={turn.index} id={`m${turn.index}`} className="absolute top-0 scroll-mt-4" />)}
      {steps.length > 0 && (
        <details className="group/steps" open={open}>
          <summary className={cx(fold, "flex h-[33px] items-center gap-2 border-b border-border text-[13px] text-muted-foreground hover:text-foreground")}>
            <span>{verdict(exchange)}</span>
            <span className="flex-1" />
            <Chevron steps />
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">{steps.map((step, i) => <StepView key={i} step={step} session={session} />)}</div>
        </details>
      )}
      {answer.trim() !== "" && <Markdown source={answer} className="gap-4 leading-[24px] [overflow-wrap:anywhere]" />}
      {quiet && <span className="text-[13px] text-muted-foreground">{exchange.stopped ? "Stopped" : "No reply"}</span>}
      {actions.length > 0 && (
        <div className="flex h-6 items-center gap-3 text-[12px] text-muted-foreground opacity-0 focus-within:opacity-100 group-hover/exchange:opacity-100">{actions}</div>
      )}
    </section>
  );
}
