import { encodePairLink, normalizeHubUrl, parseHubInput, parsePairLink, parsePairPayload } from "../src/hub/pair";

describe("pairing links", () => {
  it("round-trips a hub with an optional token", () => {
    const withToken = encodePairLink({ url: "https://hub.example:5174/memory", name: "phildesk", token: "secret" });
    expect(parsePairLink(withToken)).toEqual({ url: "https://hub.example:5174", name: "phildesk", token: "secret" });

    const plain = encodePairLink({ url: "http://10.0.2.2:5174", name: "emulator" });
    expect(parsePairLink(plain)).toEqual({ url: "http://10.0.2.2:5174", name: "emulator" });
    expect(parsePairLink(plain)).not.toHaveProperty("token");
  });

  it("accepts an http origin and a typed URL", () => {
    expect(normalizeHubUrl("http://10.0.2.2:5174/api")).toBe("http://10.0.2.2:5174");
    expect(parseHubInput("https://hub.example")).toEqual({ url: "https://hub.example" });
  });

  it("rejects javascript URLs and bad payloads", () => {
    expect(normalizeHubUrl("javascript:alert(1)")).toBeNull();
    expect(parsePairLink("javascript:alert(1)")).toBeNull();
    expect(parseHubInput("javascript:alert(1)")).toBeNull();
    expect(parsePairPayload("%%%")).toBeNull();
    expect(parsePairLink("rivethub://pair?d=not-json")).toBeNull();
    expect(parsePairLink("https://hub.example")).toBeNull();
  });
});
