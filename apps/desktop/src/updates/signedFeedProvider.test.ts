import { generateKeyPairSync, sign } from "node:crypto";
import type { RequestOptions } from "node:http";
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider";
import { describe, expect, it } from "vitest";

import { signedFeedProvider } from "./signedFeedProvider";

const FEED = "https://get.example/desktop/stable/";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const keyring = [{ id: "test-key", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() }];

const manifest = (version: string, file: string, sha512: string) =>
  `version: ${version}\nfiles:\n  - url: ${file}\n    sha512: ${sha512}\n    size: 10\npath: ${file}\nsha512: ${sha512}\n`;
const SIGNED = manifest("0.2.0", "RivetHub-0.2.0.AppImage", "c2lnbmVk");
const TAMPERED = manifest("0.2.0", "https://evil.example/RivetHub-0.2.0.deb", "dGFtcGVyZWQ=");
const signatureOf = (text: string) => `v1:test-key:${sign(null, Buffer.from(text), privateKey).toString("base64")}\n`;

type Reply = string | { status: 404 };

/** A feed whose manifest answers each request with the next reply in `manifests` (the last repeats). */
function feed(manifests: Reply[], sig: Reply) {
  const requests: string[] = [];
  const headers: Record<string, unknown>[] = [];
  let manifestReads = 0;
  const executor = {
    request: async (options: RequestOptions) => {
      const path = options.path ?? "";
      requests.push(path);
      headers.push({ ...options.headers });
      const reply = path.endsWith(".yml.sig") ? sig : manifests[Math.min(manifestReads++, manifests.length - 1)]!;
      if (typeof reply !== "string") throw Object.assign(new Error("404"), { statusCode: reply.status });
      return reply;
    },
  };
  const runtime = { platform: "linux", isUseMultipleRangeRequest: false, executor } as unknown as ProviderRuntimeOptions;
  const latest = (requireSignature: boolean) => {
    const Provider = signedFeedProvider({ url: FEED, requireSignature, keyring });
    return new Provider(null, null, runtime).getLatestVersion();
  };
  return { latest, requests, headers };
}

describe("signedFeedProvider", () => {
  it("returns the update info parsed from the signed manifest, read once", async () => {
    const { latest, requests } = feed([SIGNED, TAMPERED], signatureOf(SIGNED));
    const info = await latest(true);
    expect(info.version).toBe("0.2.0");
    expect(info.files).toEqual([{ url: "RivetHub-0.2.0.AppImage", sha512: "c2lnbmVk", size: 10 }]);
    expect(requests.filter((p) => p.endsWith(".yml"))).toHaveLength(1);
  });

  it("asks caches to revalidate both the manifest and its .sig", async () => {
    const { latest, requests, headers } = feed([SIGNED], signatureOf(SIGNED));
    await latest(true);
    expect(requests).toHaveLength(2);
    for (const sent of headers) expect(sent).toMatchObject({ "cache-control": "no-cache" });
  });

  it("refuses a valid signature served beside tampered metadata from another response", async () => {
    const { latest } = feed([TAMPERED, SIGNED], signatureOf(SIGNED));
    await expect(latest(false)).rejects.toThrow(/Signature verification failed/);
  });

  it("accepts an unsigned feed only while signatures are not required", async () => {
    await expect(feed([SIGNED], { status: 404 }).latest(false)).resolves.toMatchObject({ version: "0.2.0" });
    await expect(feed([SIGNED], { status: 404 }).latest(true)).rejects.toThrow(/not signed/);
  });

  it("refuses an empty .sig in either mode", async () => {
    await expect(feed([SIGNED], "").latest(false)).rejects.toThrow(/empty/);
  });
});
