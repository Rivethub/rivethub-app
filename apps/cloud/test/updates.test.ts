import { beforeEach, describe, expect, it } from "vitest";
import { compareVersions } from "../src/semver.js";
import type { Release } from "../src/store/types.js";
import { startHarness, type Harness } from "./harness.js";

const release = (over: Partial<Release>): Release => ({
  channel: "stable",
  os: "linux-x86_64",
  version: "0.7.2",
  url: "https://downloads.rivethub.cloud/rh-0.7.2-linux-x86_64.tar.gz",
  sha256: "a".repeat(64),
  signature: "sig-0.7.2",
  notesUrl: "https://rivethub.cloud/notes/0.7.2",
  ...over,
});

describe("GET /v1/updates/latest", () => {
  let h: Harness;
  let token: string;
  beforeEach(async () => {
    h = await startHarness();
    token = (await h.signIn("a@example.com")).token;
  });

  it("requires a valid install token", async () => {
    expect((await h.call("GET", "/v1/updates/latest?channel=stable&os=linux-x86_64")).status).toBe(401);
    expect((await h.call("GET", "/v1/updates/latest?channel=stable&os=linux-x86_64", { token: "rht_x" })).status).toBe(401);
  });

  it("returns 204 when no release exists", async () => {
    expect((await h.call("GET", "/v1/updates/latest?channel=stable&os=linux-x86_64", { token })).status).toBe(204);
  });

  it("returns the highest version for the channel and os", async () => {
    const now = new Date();
    await h.store.addRelease(release({ version: "0.7.2" }), now);
    await h.store.addRelease(release({ version: "0.10.0", signature: "sig-0.10.0" }), now);
    await h.store.addRelease(release({ version: "0.9.0" }), now);
    await h.store.addRelease(release({ version: "9.9.9", channel: "beta" }), now);
    await h.store.addRelease(release({ version: "8.0.0", os: "macos-aarch64" }), now);
    const res = await h.call("GET", "/v1/updates/latest?channel=stable&os=linux-x86_64", { token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: "0.10.0",
      url: "https://downloads.rivethub.cloud/rh-0.7.2-linux-x86_64.tar.gz",
      sha256: "a".repeat(64),
      signature: "sig-0.10.0",
      notesUrl: "https://rivethub.cloud/notes/0.7.2",
    });
    const beta = await h.call("GET", "/v1/updates/latest?channel=beta&os=linux-x86_64", { token });
    expect(((await beta.json()) as { version: string }).version).toBe("9.9.9");
  });

  it("rejects an unknown channel or os", async () => {
    expect((await h.call("GET", "/v1/updates/latest?channel=nightly&os=linux-x86_64", { token })).status).toBe(422);
    expect((await h.call("GET", "/v1/updates/latest?channel=stable", { token })).status).toBe(422);
  });
});

describe("compareVersions", () => {
  it("orders numerically and puts prereleases below releases", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.1")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });
});
