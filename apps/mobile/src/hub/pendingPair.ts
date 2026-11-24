import { parsePairLink, type PairPayload } from "./pair";

export interface PairDeepLinkOutcome {
  readonly pendingPair: PairPayload | null;
  readonly pairError: string | null;
  readonly open: boolean;
}

/**
 * Stages a `rivethub://pair` deep link for explicit user confirmation instead of
 * immediately saving or activating the hub.
 */
export function resolvePairDeepLink(url: string | null): PairDeepLinkOutcome | null {
  if (!url?.startsWith("rivethub:")) return null;
  const parsed = parsePairLink(url);
  if (!parsed) {
    return { pendingPair: null, pairError: "That pairing link is not valid.", open: true };
  }
  return { pendingPair: parsed, pairError: null, open: true };
}
