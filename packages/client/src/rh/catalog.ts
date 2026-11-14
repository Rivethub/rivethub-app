import type { Change, EntityId, Page, SessionDetail, SessionId, SessionOrigin, SessionQuery, SessionSummaryRow, TagAssignment, Visibility } from "@rivethub/contracts";
import type { Http } from "../http.js";
import { RouteMissingError } from "../errors.js";
import * as wire from "./wire.js";
import { displayTitle, sessionId, sessionSegment, strip, topicId, visibilityFromWire } from "./util.js";

const PAGE_SIZE = 50;

/** The harness id given to a session that was received from someone else, which no tool on this hub ran. */
export const SHARED_HARNESS = "shared";

const VERIFICATIONS = ["verified", "unsigned", "unknown_key"] as const;
const verification = (value: string | undefined) => VERIFICATIONS.find((known) => known === value);

type RowFields = Omit<wire.CatalogRow, "visibility" | "parentId" | "childCount"> & Partial<Pick<wire.CatalogRow, "parentId" | "childCount">>;


export function mapRow(row: RowFields, visibility: Visibility): SessionSummaryRow {
  return strip<SessionSummaryRow>({
    id: sessionId(row.id),
    title: displayTitle(row.title, row.id),
    harness: row.harness ?? SHARED_HARNESS,
    origin: row.origin ? strip<SessionOrigin>({ author: row.origin.author, verification: verification(row.origin.verification) }) : undefined,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    messageCount: row.messageCount,
    topic: row.topic ? { id: topicId(row.topic.id), path: row.topic.path } : undefined,
    visibility,
    kept: row.kept,
    trashed: row.trashed,
    memoryState: row.memoryState,
    gist: row.gist,
    parentId: row.parentId === undefined ? undefined : sessionId(row.parentId),
    childCount: row.childCount,
  });
}

export function mapCatalogRow(row: wire.CatalogRow): SessionSummaryRow {
  return mapRow(row, visibilityFromWire(row.visibility));
}

/** rh's session change is a bare sentence, so it reads as a summarizer note on the session itself. */
export function mapCatalogDetail(detail: ReturnType<typeof wire.catalogDetail.parse>): SessionDetail {
  const row = mapCatalogRow(detail);
  const at = row.endedAt ?? row.startedAt;
  const changed: Change[] = detail.changed.map((change) => ({
    kind: "fact",
    subject: { kind: "session", id: row.id, title: displayTitle(row.title, row.id) },
    text: change.summary,
    at,
    actor: { kind: "summarizer" },
  }));
  const tags: TagAssignment[] = detail.tags;
  return strip<SessionDetail>({
    ...row,
    cwd: detail.cwd,
    resumeCommand: detail.resumeCommand,
    changed,
    entities: detail.entities.map((entity) => ({ id: entity.id as EntityId, title: entity.title })),
    tags,
  });
}

export function catalogApi(http: Http) {
  const segment = (id: SessionId) => encodeURIComponent(sessionSegment(id));

  /** The new list route answers with a well-formed page. Anything else means this runtime still needs the client-side merge. */
  let present: Promise<boolean> | undefined;
  let known: boolean | undefined;
  const catalog = () =>
    (present ??= http.get("/api/sessions", wire.catalogPage, { limit: 1 }).then(
      () => (known = true),
      () => (known = false),
    ));

  async function need(): Promise<void> {
    if (!(await catalog())) throw new RouteMissingError("/api/sessions");
  }

  return {
    catalog,
    /** Whether the catalog is known to be there, when something has already found out. */
    settled: () => known,
    /** Records what a real call found, so nothing probes for it afterwards. */
    note(found: boolean) {
      known = found;
      present = Promise.resolve(found);
    },

    async sessions(query: SessionQuery): Promise<Page<SessionSummaryRow>> {
      const page = await http.get("/api/sessions", wire.catalogPage, {
        view: query.view,
        harness: query.harness,
        topic: query.topic,
        text: query.text?.trim() === "" ? undefined : query.text,
        cursor: query.cursor,
        limit: PAGE_SIZE,
      });
      const items = page.items.map(mapCatalogRow);
      return page.next === undefined ? { items } : { items, next: page.next };
    },

    session: async (id: SessionId): Promise<SessionDetail> =>
      mapCatalogDetail(await http.get(`/api/sessions/${segment(id)}`, wire.catalogDetail)),

    async trash(ids: SessionId[]): Promise<void> {
      await need();
      for (const id of ids) await http.send("POST", `/api/sessions/${segment(id)}/trash`);
    },

    async restore(ids: SessionId[]): Promise<void> {
      await need();
      for (const id of ids) await http.send("POST", `/api/sessions/${segment(id)}/restore`);
    },

    unkeep: (id: SessionId) => http.send("DELETE", `/api/sessions/${segment(id)}/keep`),
  };
}
