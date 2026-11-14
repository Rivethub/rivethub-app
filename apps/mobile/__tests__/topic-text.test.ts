import { textUnderTitle } from "../src/lib/topicText";

describe("text under a topic title", () => {
  it("shows nothing when the only text is the topic name", () => {
    expect(textUnderTitle("Field notes", "Field notes")).toBeNull();
    expect(textUnderTitle("Field notes", "  field notes  ")).toBeNull();
    expect(textUnderTitle("Field notes", "")).toBeNull();
    expect(textUnderTitle("Field notes", undefined)).toBeNull();
  });

  it("keeps a real article line", () => {
    expect(textUnderTitle("Field notes", "Notes from the shore.")).toBe("Notes from the shore.");
  });
});
