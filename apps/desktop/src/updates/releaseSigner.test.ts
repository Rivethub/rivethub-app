import { spawnSync } from "node:child_process";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { verifyEd25519Envelope } from "./verifySignature";

const SIGNER = fileURLToPath(new URL("../../../../.github/scripts/sign-release-manifest.mjs", import.meta.url));
const MANIFEST = "version: 0.2.0\npath: RivetHub-0.2.0.AppImage\n";

const pem = (key: KeyObject) => key.export({ type: "pkcs8", format: "pem" }).toString();
const ed25519 = () => generateKeyPairSync("ed25519");

/** Runs `signer` on a fresh manifest; returns the exit status, stderr, and the .sig it wrote, if any. */
function runSigner(signer: string, env: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "rivethub-sign-"));
  const manifest = path.join(dir, "latest-linux.yml");
  writeFileSync(manifest, MANIFEST);
  const result = spawnSync(process.execPath, [signer, manifest], { env: { PATH: process.env["PATH"] ?? "", ...env }, encoding: "utf8" });
  const sigFile = `${manifest}.sig`;
  return { status: result.status, stderr: result.stderr, sig: existsSync(sigFile) ? readFileSync(sigFile, "utf8") : null };
}

/** A copy of the signer laid out beside a keyring that pins `publicKey` as `id`. */
function signerPinning(id: string, publicKey: KeyObject): string {
  const root = mkdtempSync(path.join(tmpdir(), "rivethub-signer-"));
  mkdirSync(path.join(root, ".github/scripts"), { recursive: true });
  mkdirSync(path.join(root, "apps/desktop/src/updates"), { recursive: true });
  const signer = path.join(root, ".github/scripts/sign-release-manifest.mjs");
  copyFileSync(SIGNER, signer);
  const keyring = [{ id, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() }];
  writeFileSync(path.join(root, "apps/desktop/src/updates/release-keys.json"), JSON.stringify(keyring));
  return signer;
}

describe("sign-release-manifest.mjs", () => {
  it("signs with the pinned key, and the app accepts the signature", () => {
    const pair = ed25519();
    const run = runSigner(signerPinning("test-key", pair.publicKey), { RELEASE_SIGNING_KEY: pem(pair.privateKey), RELEASE_SIGNING_KEY_ID: "test-key" });
    expect(run.status).toBe(0);
    const keyring = [{ id: "test-key", publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString() }];
    expect(verifyEd25519Envelope(MANIFEST, run.sig ?? "", keyring)).toBe("test-key");
  });

  it("refuses an Ed25519 key that is not the app's pinned 2026-main key", () => {
    const seed = ed25519().privateKey.export({ type: "pkcs8", format: "der" }).subarray(-32).toString("hex");
    const run = runSigner(SIGNER, { RELEASE_SIGNING_KEY: seed });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/not the private half of pinned key '2026-main'/);
    expect(run.sig).toBeNull();
  });

  it("refuses a key that is not Ed25519", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const run = runSigner(SIGNER, { RELEASE_SIGNING_KEY: pem(rsa.privateKey) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/must be an Ed25519 key/);
    expect(run.sig).toBeNull();
  });

  it("refuses a key id the app does not pin", () => {
    const pair = ed25519();
    const run = runSigner(signerPinning("test-key", pair.publicKey), { RELEASE_SIGNING_KEY: pem(pair.privateKey), RELEASE_SIGNING_KEY_ID: "other" });
    expect(run.status).not.toBe(0);
    expect(run.sig).toBeNull();
  });

  it("publishes unsigned, with a warning, when no key is configured", () => {
    const run = runSigner(SIGNER, {});
    expect(run.status).toBe(0);
    expect(run.stderr).toMatch(/::warning::RELEASE_SIGNING_KEY is not set/);
    expect(run.sig).toBeNull();
  });
});
