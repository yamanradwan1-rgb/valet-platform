import { createHash, timingSafeEqual } from "node:crypto";

import { MfaSecurityUnavailableError } from "./mfa-crypto-config";
import {
  protectTotpSecret,
  unprotectTotpSecret,
  type TotpSecretBinding,
} from "./mfa-secret-protection";

/**
 * A04-create/A07 encrypted MFA persistence material. This is NOT VAP1 signer
 * authority: only the trusted request ceremony and SQL's locked challenge can
 * authorize a typed writer. Neither the plaintext seed nor the MFA key goes to SQL.
 */
export interface PendingMfaMaterial {
  readonly protectedSecret: string;
  readonly seedDigest: Buffer;
  readonly envelopeDigest: Buffer;
}

const canonicalUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const canonicalEnvelope =
  /^mte1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{22}$/;

export function preparePendingMfaMaterial(
  secret: string,
  binding: TotpSecretBinding,
): PendingMfaMaterial {
  if (
    !canonicalUuid.test(binding.userId) ||
    !canonicalUuid.test(binding.factorId)
  ) {
    throw new MfaSecurityUnavailableError();
  }
  const protectedSecret = protectTotpSecret(secret, binding);
  if (!canonicalEnvelope.test(protectedSecret)) {
    throw new MfaSecurityUnavailableError();
  }
  const decrypted = unprotectTotpSecret(protectedSecret, binding);
  const originalBytes = Buffer.from(secret, "utf8");
  const decryptedBytes = Buffer.from(decrypted, "utf8");
  if (
    originalBytes.length !== decryptedBytes.length ||
    !timingSafeEqual(originalBytes, decryptedBytes)
  ) {
    throw new MfaSecurityUnavailableError();
  }
  return {
    protectedSecret,
    seedDigest: createHash("sha256")
      .update("mfa-totp-seed:v1:", "utf8")
      .update(secret, "utf8")
      .digest(),
    envelopeDigest: createHash("sha256")
      .update("mfa-protected-envelope:v1:", "utf8")
      .update(protectedSecret, "utf8")
      .digest(),
  };
}
