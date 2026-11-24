import { encodePairLink } from "../src/hub/pair";
import { resolvePairDeepLink } from "../src/hub/pendingPair";

describe("pairing confirmation gating", () => {
  it("stages valid rivethub://pair links for confirmation instead of auto-connecting", () => {
    const link = encodePairLink({ url: "https://team.example:5174", name: "work", token: "tok" });
    expect(resolvePairDeepLink(link)).toEqual({
      pendingPair: { url: "https://team.example:5174", name: "work", token: "tok" },
      pairError: null,
      open: true,
    });
  });

  it("reports invalid pairing links without staging a hub", () => {
    expect(resolvePairDeepLink("rivethub://pair?d=bad")).toEqual({
      pendingPair: null,
      pairError: "That pairing link is not valid.",
      open: true,
    });
  });

  it("ignores non-rivethub links", () => {
    expect(resolvePairDeepLink(null)).toBeNull();
    expect(resolvePairDeepLink("https://rivethub.cloud")).toBeNull();
  });
});
