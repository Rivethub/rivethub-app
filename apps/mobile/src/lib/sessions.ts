import type { SessionSummaryRow } from "@rivethub/contracts";
import { hasNoMessages } from "@rivethub/client-runtime/format";

type Counted = Pick<SessionSummaryRow, "messageCount" | "messageCountUnknown">;

/** Hide the count when the hub has not counted the messages yet. */
export function showsMessageCount(session: Pick<SessionSummaryRow, "messageCountUnknown">): boolean {
  return session.messageCountUnknown !== true;
}

/** The hub counted the messages and found none. An unknown count is not empty. */
export function countedNoMessages(session: Counted): boolean {
  return hasNoMessages(session);
}

/** A session the hub counted no messages in, and that nobody chose to keep. */
export function isQuietSession(session: Counted & Pick<SessionSummaryRow, "kept">): boolean {
  return countedNoMessages(session) && !session.kept;
}

/** Hide quiet sessions until asked. The count is how many of `items` are quiet. */
export function visibleSessions<T extends Counted & Pick<SessionSummaryRow, "kept">>(items: T[], showQuiet: boolean): { shown: T[]; hidden: number } {
  const hidden = items.filter(isQuietSession).length;
  return { shown: showQuiet ? items : items.filter((item) => !isQuietSession(item)), hidden };
}

/** "2 sessions with no messages are hidden." Empty when nothing is hidden. */
export function quietSessionNote(hidden: number, shown: boolean): string | null {
  if (hidden === 0) return null;
  const noun = `${hidden.toLocaleString("en-US")} ${hidden === 1 ? "session" : "sessions"}`;
  if (shown) return `Showing ${noun} with no messages.`;
  return `${noun} with no messages ${hidden === 1 ? "is" : "are"} hidden.`;
}

/** Today leaves out a session that said nothing and changed nothing. */
export function visibleTodayEntries<T extends { session: Counted; changes: readonly unknown[] }>(entries: T[]): T[] {
  return entries.filter((entry) => entry.changes.length > 0 || !countedNoMessages(entry.session));
}
