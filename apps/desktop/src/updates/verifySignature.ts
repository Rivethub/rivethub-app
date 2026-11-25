import { createPublicKey, verify } from "node:crypto";
import releaseKeys from "./release-keys.json";

export interface TrustedReleaseKey {
  readonly id: string;
  readonly publicKeyPem: string;
}

/** The signer (.github/scripts/sign-release-manifest.mjs) refuses any key not listed here. */
export const RELEASE_KEYRING: readonly TrustedReleaseKey[] = releaseKeys;

/**
 * Off: a feed without a .sig is still accepted, as every release before signing was. Turn it on
 * once every channel has published a signed manifest; the app then refuses unsigned updates.
 */
export const REQUIRE_SIGNED_UPDATE_MANIFESTS = false;

export interface ParsedSignature {
  readonly keyId: string;
  readonly signature: Buffer;
}

export function parseReleaseSignature(rawSignature: string): ParsedSignature {
  const trimmed = rawSignature.trim();
  if (!trimmed) throw new Error("Release signature is empty.");
  const parts = trimmed.split(":");
  if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) {
    throw new Error("Release signature must use v1:<key_id>:<base64> format.");
  }
  const keyId = parts[1];
  const b64 = parts[2];
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) {
    throw new Error("Release signature contains invalid base64 characters.");
  }
  const signature = Buffer.from(b64, "base64");
  if (signature.length !== 64) {
    throw new Error(`Invalid Ed25519 signature length (${signature.length} bytes).`);
  }
  return { keyId, signature };
}

export function verifyEd25519Envelope(
  payload: Buffer | string,
  rawSignature: string,
  keyring: readonly TrustedReleaseKey[] = RELEASE_KEYRING,
): string {
  const { keyId, signature } = parseReleaseSignature(rawSignature);
  const entry = keyring.find((k) => k.id === keyId);
  if (!entry) {
    throw new Error(`Unknown release signing key '${keyId}'.`);
  }
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  const ok = verify(null, data, createPublicKey(entry.publicKeyPem), signature);
  if (!ok) {
    throw new Error(`Signature verification failed for release key '${keyId}'.`);
  }
  return keyId;
}

/**
 * Returns the manifest to act on, which is `manifest` itself once `signature` verifies it.
 * `signature` is null when the feed has no .sig, which passes only while signatures aren't required.
 */
export function acceptManifest(
  manifest: string,
  signature: string | null,
  options: { requireSignature: boolean; keyring?: readonly TrustedReleaseKey[] },
): string {
  if (signature === null) {
    if (options.requireSignature) throw new Error("The update manifest is not signed.");
    return manifest;
  }
  verifyEd25519Envelope(Buffer.from(manifest, "utf8"), signature, options.keyring);
  return manifest;
}
