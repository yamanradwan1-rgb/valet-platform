import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import {
  MfaSecurityUnavailableError,
  readMfaTotpEncryptionKey,
} from "./mfa-crypto-config";

const envelopePattern =
  /^mte1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22})$/;
const totpSecretPattern = /^[A-Z2-7]{32}$/;

export interface TotpSecretBinding {
  readonly factorId: string;
  readonly userId: string;
}

function aad(binding: TotpSecretBinding): Buffer {
  if (binding.userId.length === 0 || binding.factorId.length === 0) {
    throw new MfaSecurityUnavailableError();
  }
  return Buffer.from(
    `mfa-totp-secret:v1\u0000${binding.userId}\u0000${binding.factorId}`,
    "utf8",
  );
}

function canonicalBase64Url(value: string, length?: number): Buffer {
  try {
    const decoded = Buffer.from(value, "base64url");
    if (
      decoded.length === 0 ||
      (length !== undefined && decoded.length !== length) ||
      decoded.toString("base64url") !== value
    ) {
      throw new MfaSecurityUnavailableError();
    }
    return decoded;
  } catch (error) {
    if (error instanceof MfaSecurityUnavailableError) throw error;
    throw new MfaSecurityUnavailableError();
  }
}

export function protectTotpSecret(
  secret: string,
  binding: TotpSecretBinding,
): string {
  if (!totpSecretPattern.test(secret)) {
    throw new MfaSecurityUnavailableError();
  }
  try {
    const key = readMfaTotpEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad(binding));
    const ciphertext = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `mte1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
  } catch (error) {
    if (error instanceof MfaSecurityUnavailableError) throw error;
    throw new MfaSecurityUnavailableError();
  }
}

export function unprotectTotpSecret(
  envelope: string,
  binding: TotpSecretBinding,
): string {
  try {
    const match = envelopePattern.exec(envelope);
    if (match === null) throw new MfaSecurityUnavailableError();
    const iv = canonicalBase64Url(match[1] ?? "", 12);
    const ciphertext = canonicalBase64Url(match[2] ?? "");
    const tag = canonicalBase64Url(match[3] ?? "", 16);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      readMfaTotpEncryptionKey(),
      iv,
    );
    decipher.setAAD(aad(binding));
    decipher.setAuthTag(tag);
    const secret = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    if (!totpSecretPattern.test(secret)) {
      throw new MfaSecurityUnavailableError();
    }
    return secret;
  } catch (error) {
    if (error instanceof MfaSecurityUnavailableError) throw error;
    throw new MfaSecurityUnavailableError();
  }
}
