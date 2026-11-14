import { inAppTarget } from "../src/ui/links";

describe("hub markdown links", () => {
  it("opens a topic, entity or session inside the app", () => {
    expect(inAppTarget("/topics/2968c3bd-9d30-465f-ae0b-11b3159d5b28")).toEqual({ kind: "topic", id: "2968c3bd-9d30-465f-ae0b-11b3159d5b28" });
    expect(inAppTarget("/entities/nas-01")).toEqual({ kind: "entity", id: "nas-01" });
    expect(inAppTarget("/sessions/claude-code%3Afield-gulls")).toEqual({ kind: "session", id: "claude-code:field-gulls" });
  });

  it("leaves an http link to the browser and ignores other paths", () => {
    expect(inAppTarget("https://example.com/runbook")).toEqual({ kind: "external", href: "https://example.com/runbook" });
    expect(inAppTarget("/guide")).toBeNull();
  });
});
