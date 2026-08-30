import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import {
  parseWebPushEncryptedValue,
  serializeWebPushEncryptedValue,
} from "@valet/contracts";

export type WebPushCredentialField = "AUTH" | "ENDPOINT" | "P256DH";

export interface WebPushCredentialContext {
  readonly field: WebPushCredentialField;
  readonly subscriptionId: string;
}

export interface WebPushStorageKeyring {
  readonly active: { readonly key: Buffer; readonly version: string };
  readonly previous?: { readonly key: Buffer; readonly version: string };
}

export interface WebPushCredentialPlaintext {
  readonly auth: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly subscriptionId: string;
}

export interface WebPushPersistedCredentials {
  readonly authCiphertext: string;
  readonly encryptionKeyVersion: string;
  readonly endpointCiphertext: string;
  readonly p256dhCiphertext: string;
}

export interface WebPushPersistedCredentialRow extends WebPushPersistedCredentials {
  readonly subscriptionId: string;
}

export class WebPushDecryptionError extends Error {
  constructor() {
    super("Web Push credential material could not be decrypted.");
    this.name = "WebPushDecryptionError";
  }
}

export function createWebPushCredentialContext(
  subscriptionId: string,
  field: WebPushCredentialField,
): WebPushCredentialContext {
  if (
    !(["AUTH", "ENDPOINT", "P256DH"] as const).includes(field) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      subscriptionId,
    )
  ) {
    throw new Error("Web Push subscription credential context is invalid.");
  }
  return {
    field,
    subscriptionId: subscriptionId.toLowerCase(),
  };
}

function encodeCredentialContext(context: WebPushCredentialContext): Buffer {
  const validated = createWebPushCredentialContext(
    context.subscriptionId,
    context.field,
  );
  return Buffer.from(
    JSON.stringify({
      contract: "web-push-subscription-credential",
      version: 1,
      subscriptionId: validated.subscriptionId,
      field: validated.field,
    }),
    "utf8",
  );
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
  context: WebPushCredentialContext,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyring.active.key, iv);
  cipher.setAAD(encodeCredentialContext(context));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return serializeWebPushEncryptedValue({
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    keyVersion: keyring.active.version,
    version: 1,
  });
}

export function decryptWebPushValue(
  persistedValue: string,
  keyring: WebPushStorageKeyring,
  context: WebPushCredentialContext,
  persistedKeyVersion: string,
): string {
  try {
    const envelope = parseWebPushEncryptedValue(persistedValue);
    if (envelope.keyVersion !== persistedKeyVersion) throw new Error();
    const selected = [keyring.active, keyring.previous].find(
      (candidate) => candidate?.version === envelope.keyVersion,
    );
    if (selected === undefined) throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      selected.key,
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(encodeCredentialContext(context));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new WebPushDecryptionError();
  }
}

export function encryptWebPushCredentials(
  plaintext: WebPushCredentialPlaintext,
  keyring: WebPushStorageKeyring,
): WebPushPersistedCredentials {
  const context = (field: WebPushCredentialField) =>
    createWebPushCredentialContext(plaintext.subscriptionId, field);
  return {
    authCiphertext: encryptWebPushValue(
      plaintext.auth,
      keyring,
      context("AUTH"),
    ),
    encryptionKeyVersion: keyring.active.version,
    endpointCiphertext: encryptWebPushValue(
      plaintext.endpoint,
      keyring,
      context("ENDPOINT"),
    ),
    p256dhCiphertext: encryptWebPushValue(
      plaintext.p256dh,
      keyring,
      context("P256DH"),
    ),
  };
}

export function decryptWebPushCredentials(
  persisted: WebPushPersistedCredentialRow,
  keyring: WebPushStorageKeyring,
): Omit<WebPushCredentialPlaintext, "subscriptionId"> {
  try {
    const context = (field: WebPushCredentialField) =>
      createWebPushCredentialContext(persisted.subscriptionId, field);
    const decrypt = (value: string, field: WebPushCredentialField) =>
      decryptWebPushValue(
        value,
        keyring,
        context(field),
        persisted.encryptionKeyVersion,
      );
    return {
      auth: decrypt(persisted.authCiphertext, "AUTH"),
      endpoint: decrypt(persisted.endpointCiphertext, "ENDPOINT"),
      p256dh: decrypt(persisted.p256dhCiphertext, "P256DH"),
    };
  } catch {
    throw new WebPushDecryptionError();
  }
}
