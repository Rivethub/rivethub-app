import { decisionForSwipe, reviewDecisionFor } from "../src/review/decision";

describe("review swipe", () => {
  it("accepts at 72 points to the right and skips at 72 to the left", () => {
    expect(decisionForSwipe(72)).toBe("accept");
    expect(decisionForSwipe(71)).toBeNull();
    expect(decisionForSwipe(-72)).toBe("skip");
    expect(decisionForSwipe(-71)).toBeNull();
    expect(decisionForSwipe(0)).toBeNull();
  });

  it("turns a skip into reject and an accept with a choice into choose", () => {
    expect(reviewDecisionFor("skip", "keep-both")).toEqual({ kind: "reject" });
    expect(reviewDecisionFor("accept", "keep-both")).toEqual({ kind: "choose", value: "keep-both" });
    expect(reviewDecisionFor("accept")).toEqual({ kind: "accept" });
  });
});
