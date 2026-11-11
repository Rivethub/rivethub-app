import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { probeHealthz } from "./healthz";

let server: Server | undefined;

afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function serve(status: number, body: string, contentType = "application/json"): Promise<string> {
  server = createServer((_req, res) => res.writeHead(status, { "content-type": contentType }).end(body));
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("probeHealthz", () => {
  it("recognises a healthy RivetHub node", async () => {
    const url = await serve(200, JSON.stringify({ ok: true, sessions: 0, name: "desk", node: "desk", version: "0.8.0" }));
    expect(await probeHealthz(url)).toEqual({ kind: "rivethub", ok: true, name: "desk", node: "desk", version: "0.8.0", degraded: null });
  });

  it("still recognises a degraded node by its body", async () => {
    const url = await serve(503, JSON.stringify({ ok: false, sessions: 0, name: "desk", node: "desk", degraded: "database unavailable" }));
    expect(await probeHealthz(url)).toMatchObject({ kind: "rivethub", ok: false, version: null, degraded: "database unavailable" });
  });

  it("calls any other server on the port foreign", async () => {
    expect(await probeHealthz(await serve(200, "<h1>hello</h1>", "text/html"))).toEqual({ kind: "foreign", status: 200 });
    server!.close();
    expect(await probeHealthz(await serve(200, JSON.stringify({ ok: true })))).toEqual({ kind: "foreign", status: 200 });
  });

  it("calls a body with an empty identity foreign", async () => {
    const url = await serve(200, JSON.stringify({ ok: true, sessions: 0, name: "", node: "" }));
    expect(await probeHealthz(url)).toEqual({ kind: "foreign", status: 200 });
  });

  it("calls a body without a session count foreign", async () => {
    const url = await serve(200, JSON.stringify({ ok: true, name: "desk", node: "desk" }));
    expect(await probeHealthz(url)).toEqual({ kind: "foreign", status: 200 });
  });

  it("calls a redirect foreign even when it carries an rh-shaped body", async () => {
    const url = await serve(302, JSON.stringify({ ok: true, sessions: 0, name: "desk", node: "desk" }));
    expect(await probeHealthz(url)).toEqual({ kind: "foreign", status: 302 });
  });

  it("reports nothing listening as unreachable", async () => {
    const url = await serve(200, "{}");
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    expect(await probeHealthz(url)).toMatchObject({ kind: "unreachable" });
  });
});
