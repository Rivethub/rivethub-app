import type { ReviewDecision } from "@rivethub/contracts";

/** Drag distance, in points, that accepts or skips a Review card. */
export const SWIPE_THRESHOLD = 72;

export type SwipeOutcome = "accept" | "skip";

export function decisionForSwipe(dx: number, threshold = SWIPE_THRESHOLD): SwipeOutcome | null {
  if (dx >= threshold) return "accept";
  if (dx <= -threshold) return "skip";
  return null;
}

export function reviewDecisionFor(outcome: SwipeOutcome, choice?: string): ReviewDecision {
  if (outcome === "skip") return { kind: "reject" };
  if (choice) return { kind: "choose", value: choice };
  return { kind: "accept" };
}

export function acceptDecision(
  item: { options?: readonly { value: string }[] },
  choice: string,
  editing: boolean,
  draft: string,
): ReviewDecision {
  if (editing) return { kind: "edit", value: draft };
  const selected = choice || item.options?.[0]?.value;
  if (item.options?.length && selected) return reviewDecisionFor("accept", selected);
  return reviewDecisionFor("accept");
}
