import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  const token = async (mode: number): Promise<string> => {
    const file = path.join(dir, "local-owner.token");
    await writeFile(file, "owner-token-xyz\n", { mode });
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
});
