import type {
  IsoTime,
  Page,
  SessionDetail,
  SessionId,
  SessionQuery,
  SessionSummaryRow,
  SummaryNode,
  TopicId,
  ToolOutput,
  TranscriptPart,
  TranscriptTurn,
  Visibility,
} from "@rivethub/contracts";
import type { Http } from "../http.js";
import { NetworkError, NotFoundError, RouteMissingError } from "../errors.js";
import * as wire from "./wire.js";
import { displayTitle, harnessOf, isImportKey, sessionId, sessionSegment, strip, toRow, topicId, visibilityFromWire, visibilityToWire } from "./util.js";
import { indexTopics, sessionRow, topicPath, type TopicIndex } from "./topics.js";

const PAGE_SIZE = 50;
const EPOCH = new Date(0).toISOString() as IsoTime;

function toolSummary(tool: z_Tool): string {
  const input = tool.input ?? tool.args ?? {};
  for (const key of ["file_path", "path", "command", "query", "pattern", "url", "description"]) {
    const value = input[key];
    if (typeof value === "string" && value !== "") return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  return tool.status === "error" ? "failed" : "";
}
type z_Tool = { name: string; status: string; id?: string | undefined; args?: Record<string, unknown> | undefined; input?: Record<string, unknown> | undefined; resultText?: string | undefined };

const toolStatus = (status: string): "running" | "done" | "error" => (status === "running" || status === "error" ? status : "done");

/**
 * A turn's parts in the order they happened: the thinking, then what was said and the tool calls. rh says
 * which block ended the turn; text that ends a turn with tool calls came after them, and is the reply.
 */
export function mapTranscript(response: ReturnType<typeof wire.transcriptResponse.parse>, fallback: IsoTime): TranscriptTurn[] {
  return response.turns.map((turn, index) => {
    const parts: TranscriptPart[] = [];
    if (turn.thinking && turn.thinking.trim() !== "") parts.push({ kind: "thought", text: turn.thinking });
    // rh gives the text after a turn's last tool call apart. What came before it was said on the way.
    const reply = turn.replyText?.trim() ?? "";
    const before = reply !== "" && turn.text.trimEnd().endsWith(reply) ? turn.text.trimEnd().slice(0, -reply.length).trim() : "";
    const said: TranscriptPart[] = before !== "" ? [{ kind: "text", text: before }] : turn.text.trim() !== "" ? [{ kind: "text", text: turn.text }] : [];
    const tools = (turn.tools ?? []).map((tool): TranscriptPart => {
      const input = tool.input ?? tool.args;
      return strip<Extract<TranscriptPart, { kind: "tool" }>>({ kind: "tool", name: tool.name, summary: toolSummary(tool), status: toolStatus(tool.status), id: tool.id, input, result: tool.resultText });
    });
    if (before !== "") parts.push(...said, ...tools, { kind: "text", text: reply });
    else if (turn.lastBlock === "text") parts.push(...tools, ...said);
    else parts.push(...said, ...tools);
    const ms = turn.startedAtMs ?? turn.endedAtMs;
    const usage = turn.usage && (turn.usage.promptTokens > 0 || turn.usage.completionTokens > 0)
      ? { input: turn.usage.promptTokens, output: turn.usage.completionTokens, cached: turn.usage.cachedTokens }
      : undefined;
    return strip<TranscriptTurn>({
      index,
      role: turn.role,
      at: ms === undefined ? fallback : (new Date(ms).toISOString() as IsoTime),
      endedAt: turn.endedAtMs === undefined ? undefined : (new Date(turn.endedAtMs).toISOString() as IsoTime),
      model: turn.model,
      usage,
      parts,
    });
  });
}

/** Rebuilds the root/branch/leaf tree from rh's flat summary list, deriving message ranges from message counts. */
export function mapSummaryTree(nodes: wire.SummaryWire[]): SummaryNode {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const kids = new Map<string, wire.SummaryWire[]>();
  const tops: wire.SummaryWire[] = [];
  for (const node of nodes) {
    const parent = node.parentId === undefined ? undefined : byId.get(node.parentId);
    if (parent) kids.set(parent.id, [...(kids.get(parent.id) ?? []), node]);
    else tops.push(node);
  }
  const byTime = (a: wire.SummaryWire, b: wire.SummaryWire) => (a.earliestAt ?? "").localeCompare(b.earliestAt ?? "");

  let cursor = 0;
  const build = (node: wire.SummaryWire): SummaryNode => {
    const start = cursor;
    const children = (kids.get(node.id) ?? []).sort(byTime).map(build);
    if (children.length === 0) cursor += node.messageCount;
    const end = children.length === 0 ? cursor : (children.at(-1)?.messageRange[1] ?? cursor);
    return strip<SummaryNode>({
      level: node.kind,
      text: node.content,
      messageRange: [start, end],
      at: node.createdAt,
      children,
    });
  };

  const built = tops.sort(byTime).map(build);
  const only = built.length === 1 ? built[0] : undefined;
  if (only) return only;
  return {
    level: "root",
    text: "",
    messageRange: [built[0]?.messageRange[0] ?? 0, built.at(-1)?.messageRange[1] ?? 0],
    children: built,
  };
}

function detail(summary: wire.HarnessSessionSummary, placement: TopicPlacement, visibility: Visibility, index: TopicIndex): SessionDetail {
  const topic = placement === undefined ? undefined : index.get(placement);
  return strip<SessionDetail>({
    id: sessionId(summary.sessionId),
    title: displayTitle(summary.title ?? "", summary.sessionId),
    harness: summary.harnessId,
    startedAt: summary.createdAt,
    endedAt: summary.status === "ended" ? summary.updatedAt : undefined,
    messageCount: 0,
    messageCountUnknown: true,
    topic: topic ? { id: topicId(topic.id), path: topicPath(index, topic.id).map((step) => step.name) } : undefined,
    visibility,
    kept: false,
    trashed: false,
    memoryState: summary.status === "active" ? "capturing" : "queued",
    cwd: summary.cwd,
    changed: [],
    entities: [],
    tags: [],
  });
}
type TopicPlacement = string | undefined;

export function sessionsApi(http: Http, loadTopics: () => Promise<wire.TopicSummary[]>) {
  const segment = (id: SessionId) => encodeURIComponent(sessionSegment(id));

  async function everySession(index: TopicIndex): Promise<SessionSummaryRow[]> {
    const [filed, harnesses] = await Promise.all([
      http.get("/api/topics/filing", wire.filing),
      http.get("/api/harnesses", wire.harnessList),
    ]);
    const rows = new Map(filed.sessions.map((entry) => [entry.sessionId, sessionRow(entry, index)]));
    const lists = await Promise.all(
      harnesses.harnesses
        .filter((harness) => harness.capabilities.listSessions)
        .map((harness) =>
          http
            .get(`/api/harnesses/${encodeURIComponent(harness.harnessId)}/sessions`, wire.harnessSessionPlaneList)
            .then((list) => list.sessions)
            .catch(() => [] as wire.HarnessSessionSummary[]),
        ),
    );
    for (const summary of lists.flat()) {
      const known = rows.get(summary.sessionId);
      const fresh = toRow(detail(summary, undefined, { kind: "private" }, index));
      rows.set(
        summary.sessionId,
        known ? { ...known, startedAt: summary.createdAt, memoryState: fresh.memoryState, ...(fresh.endedAt ?? known.endedAt ? { endedAt: (fresh.endedAt ?? known.endedAt) as IsoTime } : {}) } : fresh,
      );
    }
    return [...rows.values()];
  }

  return {
    async sessions(query: SessionQuery): Promise<Page<SessionSummaryRow>> {
      const index = indexTopics(await loadTopics());
      if (query.view === "trash") {
        const trash = await http.get("/api/sessions/trash", wire.trashList);
        const items = trash.candidates.map((candidate) =>
          strip<SessionSummaryRow>({
            id: sessionId(candidate.session),
            title: displayTitle(candidate.title ?? "", candidate.session),
            harness: candidate.harness,
            startedAt: candidate.updatedAt,
            endedAt: candidate.updatedAt,
            messageCount: 0,
            messageCountUnknown: true,
            visibility: { kind: "private" },
            kept: false,
            trashed: true,
            memoryState: "queued",
          }),
        );
        return { items: items.filter((row) => matches(row, query)) };
      }
      const all = (await everySession(index))
        .filter((row) => matches(row, query))
        .filter((row) => (query.view === "unfiled" ? row.topic === undefined : true))
        .filter((row) => (query.view === "kept" ? row.kept : true))
        .sort((a, b) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt));
      const start = Number(query.cursor ?? 0) || 0;
      const items = all.slice(start, start + PAGE_SIZE);
      return start + PAGE_SIZE < all.length ? { items, next: String(start + PAGE_SIZE) } : { items };
    },

    async session(id: SessionId): Promise<SessionDetail> {
      const seg = segment(id);
      const [topics, summary, placement, visibility] = await Promise.all([
        loadTopics(),
        http.get(`/api/harness-sessions/${seg}`, wire.harnessSessionSummary),
        http.get(`/api/sessions/${seg}/placement`, wire.placementReply),
        http.get(`/api/sessions/${seg}/visibility`, wire.sessionVisibility).catch(() => undefined),
      ]);
      return detail(summary, placement.placement?.topicId, visibilityFromWire(visibility?.visibility), indexTopics(topics));
    },

    async transcript(id: SessionId, range?: [number, number]): Promise<TranscriptTurn[]> {
      // The harness's own file has the most detail (tool calls and results), but it exists only on the machine
      // that ran the session. Anywhere else, and for sessions that reached memory another way, read what the hub stored.
      // rh answers an empty transcript, not an error, for a session whose file is not on this machine.
      // A session received from someone else never ran in a tool here, so only memory has it.
      const fromHarness = isImportKey(id) ? [] : await http.get(`/api/harness-sessions/${segment(id)}/transcript`, wire.transcriptResponse).then(
        (response) => mapTranscript(response, EPOCH),
        (error: unknown) => {
          if (error instanceof NetworkError) throw error;
          return error instanceof Error ? error : new Error(String(error));
        },
      );
      let turns: TranscriptTurn[];
      if (Array.isArray(fromHarness) && fromHarness.length > 0) turns = fromHarness;
      else {
        const stored = await storedTranscript(http, id);
        turns = stored.turns;
        // Not finding a message is only "no messages" when the whole span was read.
        if (turns.length === 0 && stored.cut) throw new Error("This session's messages could not be found: memory holds too many other messages from the same hours to read through");
        if (turns.length === 0 && !Array.isArray(fromHarness)) throw fromHarness;
        if (stored.cut === "older") turns[0]!.missing = "before";
        if (stored.cut === "newer") turns.at(-1)!.missing = "after";
      }
      return range ? turns.filter((turn) => turn.index >= range[0] && turn.index <= range[1]) : turns;
    },

    async toolOutput(id: SessionId, tool: string): Promise<ToolOutput> {
      const output = await http.get(`/api/harness-sessions/${segment(id)}/tools/${encodeURIComponent(tool)}/output`, wire.toolOutput);
      return { text: output.text, failed: output.isError, truncated: output.truncated };
    },

    async summaryTree(id: SessionId): Promise<SummaryNode> {
      const dag = await http.get(`/api/memory/summaries/${encodeURIComponent(id)}`, wire.summaryDag);
      if (dag.summaries.length === 0) throw new NotFoundError(`summaries for ${id}`);
      return mapSummaryTree(dag.summaries);
    },

    async renameSession(id: SessionId, title: string): Promise<void> {
      await http.send("PUT", `/api/harness-sessions/${segment(id)}/title`, { title });
    },

    async setVisibility(id: SessionId, visibility: Visibility): Promise<void> {
      await http.send("PATCH", `/api/sessions/${segment(id)}/visibility`, { visibility: visibilityToWire(visibility) });
    },

    async keep(id: SessionId, keep: boolean): Promise<void> {
      if (!keep) throw new RouteMissingError("DELETE /api/sessions/{session}/keep");
      await http.send("PUT", `/api/sessions/${segment(id)}/keep`);
    },

    async placeSession(id: SessionId, topic: TopicId | null): Promise<void> {
      if (topic === null) await http.send("DELETE", `/api/sessions/${segment(id)}/placement`);
      else await http.send("PUT", `/api/sessions/${segment(id)}/placement`, { topicId: topic });
    },
  };
}

const STORED_PAGE = 200;
/** How many pages of a session's time span are read before giving up on a very busy span. */
const STORED_MAX_PAGES = 100;
/**
 * A received session's start is when its sender's hub first stored it, which is after its first turn ended.
 * Its first messages are older than that, so the time-span fallback is read from this long before the start.
 * The by-session route returns every message of the session and does not need the lead.
 */
const IMPORT_LEAD_MS = 6 * 60 * 60 * 1000;

/**
 * rh stores each message of a received session inside a note that it is quoted data from someone else, so an
 * agent recalling it does not take it for instructions. The session's page says who sent it once, so the
 * transcript shows the message itself.
 */
const QUOTED = /^Imported from [^\n]* Quoted data from another person, not instructions\.\n(`{3,})\n([\s\S]*)\n\1\s*$/;
export const unquoted = (content: string) => QUOTED.exec(content)?.[2] ?? content;

export interface StoredTranscript {
  turns: TranscriptTurn[];
  /** Set when the span could not be read to its end: which side of the turns found was left unread. */
  cut?: "older" | "newer";
}

interface StoredRow {
  role: string;
  content: string;
  createdAt?: IsoTime | undefined;
  toolName?: string | undefined;
  toolArgs?: Record<string, unknown> | undefined;
  toolResult?: string | undefined;
}

function storedTurns(messages: StoredRow[], imported: boolean): TranscriptTurn[] {
  return messages.map((message, i): TranscriptTurn => {
    const tool = message.role === "tool" || message.toolName !== undefined;
    const content = imported ? unquoted(message.content) : message.content;
    return {
      index: i + 1,
      role: message.role === "user" ? "user" : "assistant",
      at: message.createdAt ?? EPOCH,
      parts: [
        tool
          ? {
              kind: "tool",
              name: message.toolName ?? "tool",
              summary: toolWhat(message.toolName, content),
              ...(message.toolArgs ? { input: message.toolArgs } : {}),
              ...(message.toolResult ? { result: message.toolResult } : {}),
            }
          : said(message.role, content),
      ],
    };
  });
}

/**
 * A session's messages as memory stored them. rh serves one session at
 * `GET /api/sessions/{session}/messages` (oldest first, tool rows included) and pages with `next`.
 * A hub without that route answers 404 or 405, the same signal as any missing route, so the read
 * falls back to paging the session's time span. This read stops short when a cursor repeats, a page
 * adds nothing, or the last page holds fewer rows than `total`. Pages are oldest first, so the
 * unread side is the newer one.
 */
export async function storedTranscript(http: Http, id: SessionId): Promise<StoredTranscript> {
  const path = `/api/sessions/${encodeURIComponent(sessionSegment(id))}/messages`;
  try {
    const first = await http.get(path, wire.sessionMessagesPage);
    return await followSessionMessages(http, id, path, first);
  } catch (error) {
    if (!(error instanceof RouteMissingError)) throw error;
  }
  return storedByTime(http, id);
}

async function followSessionMessages(
  http: Http,
  id: SessionId,
  path: string,
  first: ReturnType<typeof wire.sessionMessagesPage.parse>,
): Promise<StoredTranscript> {
  const imported = isImportKey(id);
  const mine: StoredRow[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let page = first;
  let cut: StoredTranscript["cut"];
  for (;;) {
    let added = 0;
    for (const message of page.items) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      mine.push(message);
      added += 1;
    }
    const next = page.next;
    // `total` counts every stored row. A finished page that holds fewer is a short read, not an empty session.
    if (next === undefined || (page.total !== undefined && mine.length >= page.total)) {
      if (page.total !== undefined && mine.length < page.total) cut = "newer";
      break;
    }
    if (added === 0 || cursors.has(next)) {
      cut = "newer";
      break;
    }
    cursors.add(next);
    page = await http.get(path, wire.sessionMessagesPage, { cursor: next });
  }
  const turns = storedTurns(mine, imported);
  return cut ? { turns, cut } : { turns };
}

/** Browse has no session filter and drops tool rows, so this is only the fallback for an older hub. */
async function storedByTime(http: Http, id: SessionId): Promise<StoredTranscript> {
  const span = await http.get(`/api/sessions/${encodeURIComponent(sessionSegment(id))}`, wire.sessionSpan).catch(() => undefined);
  const pad = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();
  const imported = isImportKey(id);
  let since = span ? pad(span.startedAt, imported ? -IMPORT_LEAD_MS : -1000) : undefined;
  let before = span ? pad(span.endedAt ?? new Date().toISOString(), 1000) : undefined;
  const mine = new Map<string, wire.BrowsedMessage>();
  const seen = new Set<string>();
  let cut: StoredTranscript["cut"];
  let agent: string | undefined;
  for (let pages = 0; ; pages += 1) {
    const page = await http.get("/api/memory/browse", wire.memoryBrowse, {
      limit: STORED_PAGE,
      ...(agent ? { agent } : {}),
      ...(since ? { since } : {}),
      ...(before ? { before } : {}),
    });
    let fresh = 0;
    for (const message of page.messages) {
      if (!seen.has(message.id)) fresh += 1;
      seen.add(message.id);
      if (message.sessionId === id && !mine.has(message.id)) mine.set(message.id, message);
    }
    // Memory uses the capturing agent's name, not the harness id. Discover it from this session,
    // continuing without a filter until a matching message appears. Imports keep their unfiltered read.
    if (!imported && !agent) {
      const agents = new Set([...mine.values()].map((message) => message.agent).filter(Boolean));
      if (agents.size === 1) agent = [...agents][0];
    }
    // A short page is the end of the span.
    if (page.messages.length < STORED_PAGE) break;
    const first = page.messages[0]?.createdAt;
    const last = page.messages.at(-1)?.createdAt;
    const newestFirst = !first || !last || first >= last;
    // A full page means there may be more. Stop, and say so, when the page budget is spent, when the page
    // gives no time to continue from, or when it brought nothing new: reading on would repeat it forever.
    if (pages + 1 >= STORED_MAX_PAGES || !first || !last || first === last || fresh === 0) {
      cut = newestFirst ? "older" : "newer";
      break;
    }
    // The next page starts where this one ended, whichever way the hub sorted it. Repeats are dropped by id.
    if (newestFirst) before = pad(last, 1);
    else since = pad(last, -1);
  }
  const ordered = [...mine.values()].map((message, position) => ({ message, position })).sort((a, b) => (a.message.createdAt ?? "").localeCompare(b.message.createdAt ?? "") || a.position - b.position);
  const turns = storedTurns(ordered.map(({ message }) => message), imported);
  return cut ? { turns, cut } : { turns };
}

const THINKING = "[thinking] ";

/** rh stores a model's reasoning as an assistant message that starts with `[thinking] `. */
function said(role: string, content: string): TranscriptPart {
  return role !== "user" && content.startsWith(THINKING) ? { kind: "thought", text: content.slice(THINKING.length) } : { kind: "text", text: content };
}

const oneLine = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
};

/** What a stored tool did. The tool's name lives on the part, so a summary that repeats it loses that prefix. */
function toolWhat(toolName: string | undefined, content: string): string {
  let text = content.replace(/\s+/g, " ").trim();
  const name = toolName?.trim();
  if (name) {
    for (;;) {
      if (text === name) {
        text = "";
        break;
      }
      if (text.startsWith(`${name}:`)) {
        text = text.slice(name.length + 1).trim();
        continue;
      }
      if (text.startsWith(`${name} `)) {
        text = text.slice(name.length + 1).trim();
        continue;
      }
      break;
    }
  }
  return oneLine(text);
}

function matches(row: SessionSummaryRow, query: SessionQuery): boolean {
  if (query.harness !== undefined && row.harness !== query.harness) return false;
  if (query.topic !== undefined && row.topic?.id !== query.topic) return false;
  if (query.text !== undefined && query.text.trim() !== "") {
    const text = query.text.toLowerCase();
    if (!row.title.toLowerCase().includes(text) && !harnessOf(row.id).includes(text)) return false;
  }
  return true;
}
