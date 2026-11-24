import { createPublicKey, verify } from "node:crypto";

export interface TrustedReleaseKey {
  readonly id: string;
  readonly publicKeyPem: string;
}

export const RELEASE_KEYRING: readonly TrustedReleaseKey[] = [
  {
    id: "2026-main",
    publicKeyPem: [
      "-----BEGIN PUBLIC KEY-----",
      "MCowBQYDK2VwAyEAsKleiEFDp736iCYw4miADCaPdIoEia4rJSh6/bDMLVs=",
      "-----END PUBLIC KEY-----",
    ].join("\n"),
  },
];

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

export function manifestFilenameForArch(arch = process.arch): string {
  return arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function manifestMatchesUpdateInfo(
  manifestText: string,
  info: { version: string; files: readonly { sha512?: string }[] },
): boolean {
  const trimmed = manifestText.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(manifestText) as { version?: unknown; files?: { sha512?: unknown }[] };
      if (parsed.version !== info.version) return false;
      const shaSet = new Set((parsed.files ?? []).map((f) => f.sha512).filter((s): s is string => typeof s === "string"));
      return info.files.every((f) => !f.sha512 || shaSet.has(f.sha512));
    } catch {
      return false;
    }
  }
  const verRe = new RegExp(`^version:\\s*['"]?${escapeRegExp(info.version)}['"]?\\s*$`, "m");
  if (!verRe.test(manifestText)) return false;
  return info.files.every((f) => {
    if (!f.sha512) return true;
    const shaRe = new RegExp(`sha512:\\s*['"]?${escapeRegExp(f.sha512)}['"]?\\s*$`, "m");
    return shaRe.test(manifestText);
  });
}
