import { parsePairLink, type PairPayload } from "./pair";

/** The hub sheet and the pairing link it asks the user to confirm. A link never outlives the sheet. */
export interface HubSheetState {
  readonly open: boolean;
  readonly pendingPair: PairPayload | null;
  readonly pairError: string | null;
}

export type HubSheetEvent =
  | { readonly type: "link"; readonly url: string | null }
  | { readonly type: "open" }
  | { readonly type: "close" }
  | { readonly type: "cancel-pair" }
  | { readonly type: "pair-failed"; readonly message: string };

export const CLOSED_HUB_SHEET: HubSheetState = { open: false, pendingPair: null, pairError: null };

/**
 * A `rivethub://pair` deep link opens the sheet and waits for the user to confirm it instead of
 * saving or activating the hub. However the sheet closes, the waiting link and its error go.
 */
export function hubSheet(state: HubSheetState, event: HubSheetEvent): HubSheetState {
  switch (event.type) {
    case "link": {
      if (!event.url?.startsWith("rivethub:")) return state;
      const parsed = parsePairLink(event.url);
      if (!parsed) return { open: true, pendingPair: null, pairError: "That pairing link is not valid." };
      return { open: true, pendingPair: parsed, pairError: null };
    }
    case "open":
      return { ...state, open: true };
    case "close":
      return CLOSED_HUB_SHEET;
    case "cancel-pair":
      return { ...state, pendingPair: null, pairError: null };
    case "pair-failed":
      return { ...state, pairError: event.message };
  }
}
