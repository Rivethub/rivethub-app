
import type { SessionId } from "@rivethub/contracts";
import type { Http } from "../http.js";
import * as wire from "./wire.js";

export function tagsApi(http: Http) {
  const lookup = (id: SessionId) => http.sendFor("POST", "/api/memory/tags/lookup", wire.tagLookup, { session_keys: [id], states: ["accepted", "suggested"] });
  let available: Promise<boolean> | undefined;
  const supported = () => available ??= http.answers("/api/memory/tags?limit=1");
  return {
    async tagOperations(): Promise<("add" | "accept" | "reject")[]> {
      return await supported() ? ["add", "accept", "reject"] : [];
    },
    async tags(id: SessionId) {
      const result = await lookup(id);
      return (result.sessions[id] ?? []).map((t) => ({ key: t.key, value: t.value, state: t.state === "accepted" ? "applied" as const : "suggested" as const }));
    },
    async tag(id: SessionId, key: string, value: string, op: "add" | "remove" | "accept" | "reject"): Promise<void> {
      if (op === "remove") throw new Error("This hub cannot remove tags.");
      if (op === "add") {
        await http.sendFor("POST", "/api/memory/tags/add", wire.tagAdded, { entity_type: "conversation", session_key: id, key, value });
        return;
      }
      const result = await lookup(id);
      const ids = (result.sessions[id] ?? []).filter((t) => t.key === key && t.value === value).map((t) => t.id);
      if (!ids.length) throw new Error("The tag is no longer on this session.");
      await http.sendFor("POST", "/api/memory/tags/decide", wire.tagDecided, { ids, state: op === "accept" ? "accepted" : "rejected" });
    },
  };
}
