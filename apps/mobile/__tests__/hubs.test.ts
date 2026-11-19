import { hubIdFor, loadHubState, saveHubState, upsertHub, type HubRecord, type Kv } from "../src/hub/records";

function memoryKv(): Kv & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    get: async (key) => raw.get(key) ?? null,
    set: async (key, value) => {
      raw.set(key, value);
    },
    remove: async (key) => {
      raw.delete(key);
    },
  };
}

const desk: HubRecord = { id: hubIdFor("https://desk.example"), name: "workstation", url: "https://desk.example", token: "t" };
const laptop: HubRecord = { id: hubIdFor("https://laptop.example"), name: "laptop", url: "https://laptop.example" };

describe("hub storage", () => {
  it("replaces a hub that has the same URL", () => {
    const renamed: HubRecord = { ...desk, name: "desk" };
    expect(upsertHub([desk, laptop], renamed).filter((hub) => hub.url === desk.url)).toEqual([renamed]);
  });

  it("removes the stored key when a hub is forgotten", async () => {
    const kv = memoryKv();
    await saveHubState(kv, [desk, laptop], desk.id);
    await saveHubState(kv, [laptop], laptop.id);
    const loaded = await loadHubState(kv);
    expect(loaded.hubs).toEqual([laptop]);
    expect(loaded.currentId).toBe(laptop.id);
    expect(kv.raw.get(`rivethub.hub.${desk.id}`)).toBeUndefined();
  });
});
