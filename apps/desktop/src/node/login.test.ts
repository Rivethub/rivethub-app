import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mintLoginCode, signedInUrl } from "./login";

describe("signedInUrl", () => {
  const node = new URL("http://127.0.0.1:5174/review?x=1");

  it("opens the node URL when there is no code", () => {
    expect(signedInUrl(node, null)).toBe("http://127.0.0.1:5174/review?x=1");
  });

  it("carries a code in the /login fragment, never the query", () => {
    const url = new URL(signedInUrl(node, "abc-_123"));
    expect(url.pathname).toBe("/login");
    expect(url.search).toBe("");
    expect(url.hash).toBe("#code=abc-_123");
  });
});

describe("mintLoginCode", () => {
  let dir: string;
  let server: Server | undefined;
  const seen: { authorization?: string | undefined; path?: string | undefined }[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "rh-login-"));
    seen.length = 0;
  });
  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    server = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  const fakeRh = async (tokenPath: string): Promise<string> => {
    const file = path.join(dir, "rh");
    await writeFile(file, `#!/bin/sh\n[ "$1 $2 $3" = "auth token-path --json" ] || exit 2\nprintf '{"path":"%s"}\\n' '${tokenPath}'\n`, { mode: 0o755 });
    return file;
  };
  const token = async (mode: number, text = "owner-token-xyz\n"): Promise<string> => {
    const file = path.join(dir, "local-owner.token");
    await writeFile(file, text, { mode });
    await chmod(file, mode);
    return file;
  };
  const node = async (status: number, body: unknown): Promise<string> => {
    server = createServer((request, response) => {
      seen.push({ authorization: request.headers.authorization, path: `${request.method} ${request.url}` });
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  it("sends the request with the fetch it is given, so a packaged app can use the window's certificate trust", async () => {
    const calls: { url: string; authorization: string | null; redirect: RequestRedirect | undefined }[] = [];
    const given: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"), redirect: init?.redirect });
      return new Response(JSON.stringify({ code: "from-given-fetch" }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const rh = await fakeRh(await token(0o600));
    expect(await mintLoginCode("https://localhost:5174", { rh, fetch: given })).toBe("from-given-fetch");
    expect(calls).toEqual([{ url: "https://localhost:5174/api/auth/login-codes", authorization: "Bearer owner-token-xyz", redirect: "error" }]);
  });

  it("reads the owner token from the path rh names and returns only the one-time code", async () => {
    const origin = await node(200, { code: "one-time-code", expiresInSecs: 60 });
    const code = await mintLoginCode(origin, { rh: await fakeRh(await token(0o600)) });
    expect(code).toBe("one-time-code");
    expect(seen).toEqual([{ authorization: "Bearer owner-token-xyz", path: "POST /api/auth/login-codes" }]);
  });

  it("sends no request when the token file is readable by group or others", async () => {
    const origin = await node(200, { code: "one-time-code", expiresInSecs: 60 });
    expect(await mintLoginCode(origin, { rh: await fakeRh(await token(0o640)) })).toBeNull();
    expect(seen).toEqual([]);
  });

  it("sends no request when the token path is a symlink", async () => {
    const origin = await node(200, { code: "one-time-code", expiresInSecs: 60 });
    const real = await token(0o600);
    const link = path.join(dir, "link.token");
    await symlink(real, link);
    expect(await mintLoginCode(origin, { rh: await fakeRh(link) })).toBeNull();
    expect(seen).toEqual([]);
  });

  it("returns null when the node refuses, when rh is missing, and when the token file is missing", async () => {
    const refusing = await node(401, { error: "unauthorized" });
    expect(await mintLoginCode(refusing, { rh: await fakeRh(await token(0o600)) })).toBeNull();
    expect(await mintLoginCode(refusing, { rh: path.join(dir, "no-such-rh") })).toBeNull();
    expect(await mintLoginCode(refusing, { rh: await fakeRh(path.join(dir, "absent.token")) })).toBeNull();
  });

  it("refuses a token with whitespace inside and logs nothing that holds it", async () => {
    const origin = await node(200, { code: "one-time-code", expiresInSecs: 60 });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await mintLoginCode(origin, { rh: await fakeRh(await token(0o600, "SECRETPART1\nSECRETPART2\n")) })).toBeNull();
    expect(seen).toEqual([]);
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/SECRETPART/);
    logged.mockRestore();
  });

  it("logs a fixed message when the request fails, never the error's own text", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const refusing = await node(401, { error: "owner-token-xyz" });
    expect(await mintLoginCode(refusing, { rh: await fakeRh(await token(0o600)) })).toBeNull();
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/owner-token-xyz|401/);
    logged.mockRestore();
  });

  it("follows no redirect, so nothing off the node origin receives a request", async () => {
    const landed: string[] = [];
    const elsewhere = createServer((request, response) => {
      landed.push(`${request.method} ${request.url}`);
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ code: "stolen" }));
    });
    await new Promise<void>((resolve) => elsewhere.listen(0, "127.0.0.1", resolve));
    try {
      const target = `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}/api/auth/login-codes`;
      server = createServer((request, response) => {
        seen.push({ authorization: request.headers.authorization, path: `${request.method} ${request.url}` });
        response.writeHead(307, { location: target }).end();
      });
      await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      expect(await mintLoginCode(origin, { rh: await fakeRh(await token(0o600)) })).toBeNull();
      expect(landed).toEqual([]);
    } finally {
      await new Promise((resolve) => elsewhere.close(resolve));
    }
  });
});
