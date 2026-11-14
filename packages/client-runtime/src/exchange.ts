import type { IsoTime, TranscriptPart, TranscriptTurn, TurnUsage } from "@rivethub/contracts";

export type ToolPart = Extract<TranscriptPart, { kind: "tool" }>;

/** One thing the agent did on the way to its reply. */
export type Step =
  | { kind: "thought"; text: string }
  /** Something the agent said before it went on working. */
  | { kind: "note"; text: string }
  | { kind: "tools"; tools: ToolPart[] };

/** A prompt and everything the agent did and said in answer to it. */
export interface Exchange {
  /** Index of the first turn, for keys and anchors. */
  index: number;
  /** Absent when the transcript opens on the agent, as a subagent's or a cut transcript can. */
  prompt?: TranscriptTurn;
  /** The agent's turns, in order. */
  replies: TranscriptTurn[];
  steps: Step[];
  /** What the agent said last, after its last step. Empty when it ended on a step. */
  answer: string;
  stopped: boolean;
  startedAt?: IsoTime;
  endedAt?: IsoTime;
  model?: string;
  usage?: TurnUsage;
}

const EPOCH_MS = 0;
const ms = (iso: IsoTime | undefined) => {
  const at = iso === undefined ? Number.NaN : new Date(iso).getTime();
  return Number.isNaN(at) || at === EPOCH_MS ? undefined : at;
};

const isInterruption = (turn: TranscriptTurn) =>
  turn.parts.some((part) => part.kind === "text" && part.text.trimStart().startsWith("[Request interrupted by user"));

/**
 * Folds a transcript into exchanges. A user turn opens one. Of what the agent said, only the text after its
 * last thought or tool call is the reply; text before that is a note among the steps.
 */
export function exchanges(turns: TranscriptTurn[]): Exchange[] {
  const out: Exchange[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      const last = out.at(-1);
      if (isInterruption(turn) && last) {
        last.stopped = true;
        continue;
      }
      out.push({ index: turn.index, prompt: turn, replies: [], steps: [], answer: "", stopped: false, ...(ms(turn.at) === undefined ? {} : { startedAt: turn.at }) });
      continue;
    }
    let exchange = out.at(-1);
    if (!exchange) {
      exchange = { index: turn.index, replies: [], steps: [], answer: "", stopped: false };
      out.push(exchange);
    }
    absorb(exchange, turn);
  }
  return out;
}

function absorb(exchange: Exchange, turn: TranscriptTurn) {
  exchange.replies.push(turn);
  if (exchange.startedAt === undefined && ms(turn.at) !== undefined) exchange.startedAt = turn.at;
  const ended = turn.endedAt ?? turn.at;
  if (ms(ended) !== undefined && (ms(exchange.endedAt) ?? -1) <= ms(ended)!) exchange.endedAt = ended;
  if (turn.model) exchange.model = turn.model;
  if (turn.usage) {
    const sum = exchange.usage ?? { input: 0, output: 0, cached: 0 };
    exchange.usage = { input: sum.input + turn.usage.input, output: sum.output + turn.usage.output, cached: sum.cached + turn.usage.cached };
  }
  const demote = () => {
    if (exchange.answer.trim() !== "") exchange.steps.push({ kind: "note", text: exchange.answer });
    exchange.answer = "";
  };
  for (const part of turn.parts) {
    if (part.kind === "text") {
      if (part.text.trim() === "") continue;
      demote();
      exchange.answer = part.text;
    } else if (part.kind === "thought") {
      if (part.text.trim() === "") continue;
      demote();
      exchange.steps.push({ kind: "thought", text: part.text });
    } else {
      demote();
      const last = exchange.steps.at(-1);
      if (last?.kind === "tools") last.tools.push(part);
      else exchange.steps.push({ kind: "tools", tools: [part] });
    }
  }
}

export function toolCount(exchange: Exchange): number {
  return exchange.steps.reduce((total, step) => total + (step.kind === "tools" ? step.tools.length : 0), 0);
}

export type ToolCategory = "read" | "search" | "edit" | "command" | "web" | "subagent" | "tool";

const CATEGORIES: Record<Exclude<ToolCategory, "tool">, string[]> = {
  read: ["read", "notebookread", "read_file", "view", "cat"],
  search: ["grep", "glob", "ls", "search", "list_dir", "find", "codebase_search", "toolsearch"],
  edit: ["edit", "multiedit", "write", "notebookedit", "search_replace", "write_file", "apply_patch", "patch", "str_replace"],
  command: ["bash", "bashoutput", "killshell", "shell", "exec", "exec_command", "run_terminal_command", "local_shell", "terminal"],
  web: ["webfetch", "websearch", "web_fetch", "web_search", "fetch"],
  subagent: ["agent", "task", "subagent", "spawn_agent"],
};

export function toolCategory(name: string): ToolCategory {
  const key = name.trim().toLowerCase();
  for (const [category, names] of Object.entries(CATEGORIES)) if (names.includes(key)) return category as ToolCategory;
  return "tool";
}

const DONE: Record<ToolCategory, [verb: string, one: string, many: string]> = {
  read: ["read", "file", "files"],
  search: ["ran", "search", "searches"],
  edit: ["edited", "file", "files"],
  command: ["ran", "command", "commands"],
  web: ["made", "web request", "web requests"],
  subagent: ["ran", "subagent", "subagents"],
  tool: ["used", "tool", "tools"],
};

const filePath = (tool: ToolPart): string | undefined => {
  const path = tool.input?.file_path ?? tool.input?.path;
  return typeof path === "string" && path !== "" ? path : undefined;
};

/**
 * Names what a run of tool calls did: "Read 3 files and ran 2 commands". A file counts once however often
 * the run read or edited it.
 */
export function groupSummary(tools: ToolPart[]): string {
  const tally: [ToolCategory, number][] = [];
  const files = new Set<string>();
  for (const tool of tools) {
    const category = toolCategory(tool.name);
    const path = category === "read" || category === "edit" ? filePath(tool) : undefined;
    if (path !== undefined) {
      const key = `${category}\n${path}`;
      if (files.has(key)) continue;
      files.add(key);
    }
    const seen = tally.find(([c]) => c === category);
    if (seen) seen[1] += 1;
    else tally.push([category, 1]);
  }
  const words = tally.slice(0, 3).map(([category, count]) => {
    const [verb, one, many] = DONE[category];
    return `${verb} ${count} ${count === 1 ? one : many}`;
  });
  let summary = words.length <= 1 ? (words[0] ?? "") : words.length === 2 ? `${words[0]} and ${words[1]}` : `${words[0]}, ${words[1]} and ${words[2]}`;
  if (tally.length > 3) summary += ", etc.";
  return summary === "" ? "" : summary[0]!.toUpperCase() + summary.slice(1);
}

/** The first line of a thought, to show beside "Think" while it is folded. */
export function thoughtSummary(thinking: string): string {
  const paragraph = thinking.split("\n\n").map((p) => p.trim()).find((p) => p !== "");
  return (paragraph?.split("\n")[0] ?? "").replaceAll("**", "").trim();
}

export function elapsed(milliseconds: number): string {
  const seconds = Math.max(1, Math.floor((milliseconds + 500) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** "Completed in 1m 12s · 14 tool calls", the line an exchange's steps fold under. */
export function verdict(exchange: Exchange): string {
  const start = ms(exchange.startedAt);
  const end = ms(exchange.endedAt);
  const took = start !== undefined && end !== undefined && end > start ? end - start : undefined;
  const word = exchange.stopped ? "Stopped" : "Completed";
  const head = took === undefined ? word : `${word} ${exchange.stopped ? "after" : "in"} ${elapsed(took)}`;
  const tools = toolCount(exchange);
  return tools === 0 ? head : `${head} · ${tools} tool ${tools === 1 ? "call" : "calls"}`;
}

/** A token count as people read it: "812", "1.2k", "24k", "1.3M". */
export function tokens(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 10_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** The model and the tokens behind a reply: "claude-opus-5-5 · 1.2k out · 24k in · 80% cached". */
export function replyMeta(exchange: Exchange): string {
  const usage = exchange.usage;
  const cached = usage && usage.input > 0 ? Math.round((usage.cached * 100) / usage.input) : 0;
  return [
    exchange.model ?? "",
    usage && usage.output > 0 ? `${tokens(usage.output)} out` : "",
    usage && usage.input > 0 ? `${tokens(usage.input)} in` : "",
    cached > 0 ? `${cached}% cached` : "",
  ].filter(Boolean).join(" · ");
}

const firstLine = (text: string) => (text.split("\n")[0] ?? "").trim();
const str = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value : undefined);

/** What one tool call did, in a line: a command's description, a file's path, a search's pattern. */
export function toolLabel(tool: ToolPart): string {
  const input = tool.input ?? {};
  const category = toolCategory(tool.name);
  const pick = (...keys: string[]) => keys.map((key) => str(input[key])).find((value) => value !== undefined);
  const label =
    category === "command" ? pick("description") ?? pick("command", "cmd")
    : category === "read" || category === "edit" ? pick("file_path", "path", "notebook_path")
    : category === "search" ? pick("pattern", "query", "path")
    : category === "web" ? pick("url", "query")
    : category === "subagent" ? pick("description", "prompt")
    : undefined;
  return firstLine(label ?? tool.summary) || tool.name;
}
