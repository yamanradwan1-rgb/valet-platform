import {
  constants,
  createPrivateKey,
  privateDecrypt,
  type KeyObject,
} from "node:crypto";
import type {
  OutboundEnvelopeAAD,
  OutboundEnvelopeOpener,
  SealedOutboundEnvelope,
} from "../contracts/outbound-envelope";

/** Canonical JSON property order is identical to W2's issuer OAEP label. */
export function canonicalOutboundSenderLabel(aad: OutboundEnvelopeAAD): Buffer {
  if (
    aad.version !== 1 || aad.credentialGeneration !== 1 ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(aad.expiresAt) ||
    !/^hmac:v[0-9]+:[A-Za-z0-9_-]{32,128}$/.test(aad.recipientDigest)
  ) throw new Error("OUTBOUND_ENVELOPE_SCOPE_INVALID");
  for (const value of [
    aad.organizationId, aad.locationId, aad.sessionId, aad.customerId, aad.intentId,
  ]) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error("OUTBOUND_ENVELOPE_SCOPE_INVALID");
    }
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

function validatePrivateKey(pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new Error("OUTBOUND_SENDER_KEY_INVALID");
  }
  if (
    key.asymmetricKeyType !== "rsa" ||
    (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  ) throw new Error("OUTBOUND_SENDER_KEY_INVALID");
  return key;
}

/** Only a restricted sender process receives the private key. */
export function createOutboundEnvelopeOpener(
  privateKeyPem: string,
  expectedKeyVersion: string,
): OutboundEnvelopeOpener {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(expectedKeyVersion)) {
    throw new Error("OUTBOUND_SENDER_KEY_VERSION_INVALID");
  }
  const key = validatePrivateKey(privateKeyPem);
  return {
    open(sealed: SealedOutboundEnvelope, expected: OutboundEnvelopeAAD): string {
      if (
        sealed.algorithm !== "RSA-OAEP-SHA256" ||
        sealed.keyVersion !== expectedKeyVersion ||
        !(sealed.ciphertext instanceof Uint8Array) ||
        sealed.ciphertext.byteLength !== (key.asymmetricKeyDetails!.modulusLength! / 8) ||
        !(sealed.purgeAt instanceof Date) ||
        sealed.purgeAt.valueOf() <= Date.now() ||
        canonicalOutboundSenderLabel(sealed.aad).compare(canonicalOutboundSenderLabel(expected)) !== 0
      ) throw new Error("OUTBOUND_ENVELOPE_AUTH_FAILED");
      let decrypted: Buffer;
      try {
        decrypted = privateDecrypt({
          key,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
          oaepLabel: canonicalOutboundSenderLabel(expected),
        }, sealed.ciphertext);
      } catch {
        throw new Error("OUTBOUND_ENVELOPE_AUTH_FAILED");
      }
      if (!/^[A-Za-z0-9_-]{43}$/.test(decrypted.toString("utf8"))) {
        decrypted.fill(0);
        throw new Error("OUTBOUND_ENVELOPE_AUTH_FAILED");
      }
      const token = decrypted.toString("utf8");
      decrypted.fill(0);
      return token;
    },
  };
}

export function senderEnvelopeOpenerFromEnv(
  env: NodeJS.ProcessEnv,
): OutboundEnvelopeOpener {
  const pem = env.GUEST_ACCESS_TRANSPORT_PRIVATE_KEY_PEM;
  const version = env.GUEST_ACCESS_TRANSPORT_KEY_VERSION;
  if (!pem || !version) throw new Error("OUTBOUND_SENDER_KEY_NOT_READY");
  return createOutboundEnvelopeOpener(pem, version);
}
