import {
  constants,
  createHmac,
  createPublicKey,
  publicEncrypt,
  type KeyObject,
} from "node:crypto";

import type {
  OutboundEnvelopeAAD,
  OutboundEnvelopeSealer,
  SealedOutboundEnvelope,
} from "../contracts/outbound-envelope";

const keyVersionPattern = /^[a-zA-Z0-9._-]{1,64}$/;
const normalizedPhonePattern = /^\+[1-9][0-9]{7,14}$/;

/** JSON property ordering is part of the frozen OAEP label scheme. */
export function canonicalOutboundEnvelopeLabel(aad: OutboundEnvelopeAAD): Buffer {
  if (
    aad.version !== 1 ||
    aad.credentialGeneration !== 1 ||
    !Number.isSafeInteger(aad.credentialGeneration) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(aad.expiresAt)
  ) {
    throw new Error("Invalid initial guest envelope label.");
  }
  for (const id of [
    aad.organizationId,
    aad.locationId,
    aad.sessionId,
    aad.customerId,
    aad.intentId,
  ]) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Invalid initial guest envelope scope.");
    }
  }
  if (!/^hmac:v[0-9]+:[A-Za-z0-9_-]{32,128}$/.test(aad.recipientDigest)) {
    throw new Error("Invalid recipient digest version.");
  }
  return Buffer.from(JSON.stringify({
    version: aad.version,
    organizationId: aad.organizationId,
    locationId: aad.locationId,
    sessionId: aad.sessionId,
    customerId: aad.customerId,
    intentId: aad.intentId,
    credentialGeneration: aad.credentialGeneration,
    recipientDigest: aad.recipientDigest,
    expiresAt: aad.expiresAt,
  }), "utf8");
}

export function createRecipientDigestFactory(
  keyBase64: string,
  keyVersion: string,
): (phone: string) => string {
  const key = Buffer.from(keyBase64, "base64");
  if (!/^v[0-9]+$/.test(keyVersion) || key.length < 32 ||
    key.toString("base64") !== keyBase64) {
    throw new Error("Recipient HMAC configuration is invalid.");
  }
  return (phone) => {
    if (!normalizedPhonePattern.test(phone)) {
      throw new Error("Canonical recipient is invalid.");
    }
    return `hmac:${keyVersion}:${createHmac("sha256", key)
      .update(phone, "utf8").digest("base64url")}`;
  };
}

/** Public-only issuer capability. The sender must receive the private key separately. */
export function createInitialGuestEnvelopeSealer(
  publicKeyPem: string,
  keyVersion: string,
): OutboundEnvelopeSealer {
  let key: KeyObject;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    throw new Error("Initial guest public encryption key is invalid.");
  }
  if (!keyVersionPattern.test(keyVersion) || key.asymmetricKeyType !== "rsa" ||
    (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) {
    throw new Error("Initial guest public encryption key is unsupported.");
  }
  return {
    seal(token, aad): SealedOutboundEnvelope {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new Error("Invalid initial guest credential format.");
      }
      const label = canonicalOutboundEnvelopeLabel(aad);
      const ciphertext = publicEncrypt({
        key,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
        oaepLabel: label,
      }, Buffer.from(token, "utf8"));
      return {
        algorithm: "RSA-OAEP-SHA256",
        keyVersion,
        ciphertext,
        aad,
        purgeAt: new Date(aad.expiresAt),
      };
    },
  };
}
