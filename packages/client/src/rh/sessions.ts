import type {
  IsoTime,
  Page,
  SessionDetail,
  SessionId,
  SessionQuery,
  SessionSummaryRow,
  SummaryNode,
  TopicId,
  TranscriptPart,
  TranscriptTurn,
  Visibility,
} from "@rivethub/contracts";
import type { Http } from "../http.js";
import { NetworkError, NotFoundError, RouteMissingError } from "../errors.js";
import * as wire from "./wire.js";
import { harnessOf, sessionId, sessionSegment, strip, toRow, topicId, visibilityFromWire, visibilityToWire } from "./util.js";
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
type z_Tool = { name: string; status: string; args?: Record<string, unknown> | undefined; input?: Record<string, unknown> | undefined };

export function mapTranscript(response: ReturnType<typeof wire.transcriptResponse.parse>, fallback: IsoTime): TranscriptTurn[] {
  return response.turns.map((turn, index) => {
    const parts: TranscriptPart[] = [];
    if (turn.text.trim() !== "") parts.push({ kind: "text", text: turn.text });
    for (const tool of turn.tools ?? []) parts.push({ kind: "tool", name: tool.name, summary: toolSummary(tool) });
    const ms = turn.startedAtMs ?? turn.endedAtMs;
    return { index, role: turn.role, at: ms === undefined ? fallback : (new Date(ms).toISOString() as IsoTime), parts };
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
    title: summary.title ?? summary.sessionId,
    harness: summary.harnessId,
    startedAt: summary.createdAt,
    endedAt: summary.status === "ended" ? summary.updatedAt : undefined,
    messageCount: 0,
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
            title: candidate.title ?? candidate.session,
            harness: candidate.harness,
            startedAt: candidate.updatedAt,
            endedAt: candidate.updatedAt,
            messageCount: 0,
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
      const turns = await http.get(`/api/harness-sessions/${segment(id)}/transcript`, wire.transcriptResponse).then(
        (response) => mapTranscript(response, EPOCH),
        async (error: unknown) => {
          if (error instanceof NetworkError) throw error;
          const stored = await storedTranscript(http, id);
          if (stored.length === 0) throw error;
          return stored;
        },
      );
      return range ? turns.filter((turn) => turn.index >= range[0] && turn.index <= range[1]) : turns;
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

/**
 * A session's messages as memory stored them. rh has no route that reads one session's messages, so this
 * browses the session's own time span for its harness and keeps the messages that belong to it. A span
 * holding more than one page of messages comes back short; the harness transcript has no such limit.
 */
export async function storedTranscript(http: Http, id: SessionId): Promise<TranscriptTurn[]> {
  const span = await http.get(`/api/sessions/${sessionSegment(id)}`, wire.sessionSpan).catch(() => undefined);
  const pad = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();
  const page = await http.get("/api/memory/browse", wire.memoryBrowse, {
    limit: STORED_PAGE,
    agent: harnessOf(id),
    ...(span ? { since: pad(span.startedAt, -1000), before: pad(span.endedAt ?? new Date().toISOString(), 1000) } : {}),
  });
  const mine = page.messages.filter((message) => message.sessionId === id);
  const ordered = mine.map((message, position) => ({ message, position })).sort((a, b) => (a.message.createdAt ?? "").localeCompare(b.message.createdAt ?? "") || a.position - b.position);
  return ordered.map(({ message }, i) => {
    const tool = message.role === "tool" || message.toolName !== undefined;
    return {
      index: i + 1,
      role: message.role === "user" ? "user" : "assistant",
      at: message.createdAt ?? EPOCH,
      parts: [tool ? { kind: "tool", name: message.toolName ?? "tool", summary: oneLine(message.toolName ? `${message.toolName}: ${message.content}` : message.content) } : { kind: "text", text: message.content }],
    } satisfies TranscriptTurn;
  });
}

const oneLine = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
};

function matches(row: SessionSummaryRow, query: SessionQuery): boolean {
  if (query.harness !== undefined && row.harness !== query.harness) return false;
  if (query.topic !== undefined && row.topic?.id !== query.topic) return false;
  if (query.text !== undefined && query.text.trim() !== "") {
    const text = query.text.toLowerCase();
    if (!row.title.toLowerCase().includes(text) && !harnessOf(row.id).includes(text)) return false;
  }
  return true;
}
