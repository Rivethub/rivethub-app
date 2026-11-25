import { encodePairLink } from "../src/hub/pair";
import { CLOSED_HUB_SHEET, hubSheet, type HubSheetEvent } from "../src/hub/pendingPair";

const LINK = encodePairLink({ url: "https://team.example:5174", name: "work", token: "tok" });
const run = (...events: HubSheetEvent[]) => events.reduce(hubSheet, CLOSED_HUB_SHEET);

describe("pairing confirmation gating", () => {
  it("stages valid rivethub://pair links for confirmation instead of auto-connecting", () => {
    expect(run({ type: "link", url: LINK })).toEqual({
      pendingPair: { url: "https://team.example:5174", name: "work", token: "tok" },
      pairError: null,
      open: true,
    });
  });

  it("reports invalid pairing links without staging a hub", () => {
    expect(run({ type: "link", url: "rivethub://pair?d=bad" })).toEqual({
      pendingPair: null,
      pairError: "That pairing link is not valid.",
      open: true,
    });
  });

  it("ignores non-rivethub links", () => {
    expect(run({ type: "link", url: null })).toEqual(CLOSED_HUB_SHEET);
    expect(run({ type: "link", url: "https://rivethub.cloud" })).toEqual(CLOSED_HUB_SHEET);
  });

  it("drops a staged link and its error when the sheet is dismissed, so reopening shows no prompt", () => {
    expect(run({ type: "link", url: LINK }, { type: "close" }, { type: "open" })).toEqual({ open: true, pendingPair: null, pairError: null });
    expect(run({ type: "link", url: "rivethub://pair?d=bad" }, { type: "close" }, { type: "open" })).toEqual({ open: true, pendingPair: null, pairError: null });
  });

  it("keeps the staged link with the error when saving it fails, until cancelled", () => {
    const failed = run({ type: "link", url: LINK }, { type: "pair-failed", message: "Name the hub." });
    expect(failed).toMatchObject({ open: true, pairError: "Name the hub.", pendingPair: { name: "work" } });
    expect(hubSheet(failed, { type: "cancel-pair" })).toEqual({ open: true, pendingPair: null, pairError: null });
  });
});
