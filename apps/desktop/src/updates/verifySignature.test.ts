import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RELEASE_KEYRING, verifyEd25519Envelope } from "./verifySignature";

function generateTestPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey,
  };
}

describe("verifyEd25519Envelope", () => {
  it("pins 2026-main public key in the keyring", () => {
    expect(RELEASE_KEYRING.some((k) => k.id === "2026-main")).toBe(true);
  });

  it("verifies a valid v1:<key_id>:<base64> Ed25519 signature", () => {
    const pair = generateTestPair();
    const payload = Buffer.from("version: 0.9.0\npath: RivetHub-0.9.0.AppImage\n");
    const sig = sign(null, payload, pair.privateKey).toString("base64");
    const keyring = [...RELEASE_KEYRING, { id: "test-key", publicKeyPem: pair.publicKeyPem }];
    expect(verifyEd25519Envelope(payload, `v1:test-key:${sig}\n`, keyring)).toBe("test-key");
  });

  it("rejects tampered payloads, wrong keys, unknown key ids, and malformed envelopes", () => {
    const pair = generateTestPair();
    const payload = Buffer.from("version: 0.9.0\n");
    const sig = sign(null, payload, pair.privateKey).toString("base64");
    const keyring = [{ id: "test-key", publicKeyPem: pair.publicKeyPem }];

    expect(() => verifyEd25519Envelope("version: 0.9.1\n", `v1:test-key:${sig}`, keyring)).toThrow(/Signature verification failed/);
    expect(() => verifyEd25519Envelope(payload, `v1:2026-main:${sig}`)).toThrow(/Signature verification failed/);
    expect(() => verifyEd25519Envelope(payload, `v1:unknown-key:${sig}`, keyring)).toThrow(/Unknown release signing key/);
    expect(() => verifyEd25519Envelope(payload, "", keyring)).toThrow(/empty/);
    expect(() => verifyEd25519Envelope(payload, "not-v1", keyring)).toThrow(/format/);
    expect(() => verifyEd25519Envelope(payload, "v1:test-key:AAAA", keyring)).toThrow(/length/);
  });
});
