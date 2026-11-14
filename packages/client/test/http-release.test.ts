import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHttp } from "../src/http.js";

/** A fetch whose response body records whether anyone read or cancelled it. */
function tracked(status = 200) {
  const state = { cancelled: 0, served: 0 };
  const fetch = async () => {
    state.served += 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ ok: true })));
        controller.close();
      },
      cancel() {
        state.cancelled += 1;
      },
    });
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, state };
}

describe("unread responses", () => {
  it("a probe lets go of the body it does not read, so it does not hold a connection until its timeout", async () => {
    const { fetch, state } = tracked();
    expect(await createHttp({ baseUrl: "http://hub.test", fetch }).answers("/api/today")).toBe(true);
    expect(state).toEqual({ served: 1, cancelled: 1 });
  });

  it("a write lets go of a body it does not read", async () => {
    const { fetch, state } = tracked();
    await createHttp({ baseUrl: "http://hub.test", fetch }).send("POST", "/api/sessions/s/trash");
    expect(state.cancelled).toBe(1);
  });

  it("a read consumes its body and cancels nothing", async () => {
    const { fetch, state } = tracked();
    expect(await createHttp({ baseUrl: "http://hub.test", fetch }).get("/api/x", z.object({ ok: z.boolean() }))).toEqual({ ok: true });
    expect(state.cancelled).toBe(0);
  });
});
