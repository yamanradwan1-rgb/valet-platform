import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import type { WebPushEncryptedValue } from "@valet/contracts";

export interface WebPushStorageKeyring {
  readonly active: { readonly key: Buffer; readonly version: string };
  readonly previous?: { readonly key: Buffer; readonly version: string };
}

export class WebPushDecryptionError extends Error {
  constructor() {
    super("Web Push credential material could not be decrypted.");
    this.name = "WebPushDecryptionError";
  }
}

export function fingerprintWebPushEndpoint(
  endpoint: string,
  fingerprintKey: Buffer,
): string {
  if (endpoint === "" || fingerprintKey.length !== 32) {
    throw new Error("Web Push endpoint fingerprint input is invalid.");
  }
  return `hmac-sha256:v1:${createHmac("sha256", fingerprintKey)
    .update(endpoint, "utf8")
    .digest("hex")}`;
}

export function encryptWebPushValue(
  plaintext: string,
  keyring: WebPushStorageKeyring,
): WebPushEncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyring.active.key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    keyVersion: keyring.active.version,
    version: 1,
  };
}

export function decryptWebPushValue(
  envelope: WebPushEncryptedValue,
  keyring: WebPushStorageKeyring,
): string {
  try {
    if (envelope.version !== 1) throw new Error();
    const selected = [keyring.active, keyring.previous].find(
      (candidate) => candidate?.version === envelope.keyVersion,
    );
    if (selected === undefined) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      selected.key,
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new WebPushDecryptionError();
  }
}
