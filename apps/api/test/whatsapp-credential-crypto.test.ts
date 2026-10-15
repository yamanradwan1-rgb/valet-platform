import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
} from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalOutboundEnvelopeLabel,
  createInitialGuestEnvelopeSealer,
  createRecipientDigestFactory,
} from "../src/modules/notifications/issuance/initial-guest-crypto";
import { createInitialGuestIssuanceFromEnv } from "../src/modules/notifications/issuance/initial-guest-runtime";
import { generateGuestAccessToken } from "../src/modules/valet-sessions/guest-access-token";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
  customerId: "44444444-4444-4444-8444-444444444444",
  intentId: "55555555-5555-4555-8555-555555555555",
};

describe("initial Guest RSA envelope and recipient HMAC", () => {
  it("seals with public RSA-3072 and binds every AAD field via OAEP label", () => {
    const keys = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const sealer = createInitialGuestEnvelopeSealer(
      keys.publicKey.export({ type: "spki", format: "pem" }).toString(), "k1",
    );
    const digest = createRecipientDigestFactory(randomBytes(32).toString("base64"), "v1");
    const recipientDigest = digest("+962790000000");
    expect(recipientDigest).toMatch(/^hmac:v1:[A-Za-z0-9_-]{43}$/);
    expect(recipientDigest).not.toContain("962790000000");
    const aad = {
      version: 1 as const,
      ...ids,
      credentialGeneration: 1,
      recipientDigest,
      expiresAt: "2026-10-16T00:00:00.000Z",
    };
    const token = generateGuestAccessToken();
    const sealed = sealer.seal(token, aad);
    const openWith = (label: Buffer) => privateDecrypt({
      key: keys.privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
      oaepLabel: label,
    }, Buffer.from(sealed.ciphertext)).toString("utf8");
    expect(openWith(canonicalOutboundEnvelopeLabel(aad))).toBe(token);
    expect(sealed.ciphertext.byteLength).toBe(384);
    const altered = [
      { ...aad, organizationId: ids.locationId },
      { ...aad, locationId: ids.organizationId },
      { ...aad, sessionId: ids.customerId },
      { ...aad, customerId: ids.sessionId },
      { ...aad, intentId: ids.sessionId },
      { ...aad, recipientDigest: digest("+962791111111") },
      { ...aad, expiresAt: "2026-10-16T00:00:01.000Z" },
    ];
    for (const changed of altered) {
      expect(() => openWith(canonicalOutboundEnvelopeLabel(changed))).toThrow();
    }
    const ciphertext = Buffer.from(sealed.ciphertext);
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    expect(() => privateDecrypt({
      key: keys.privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
      oaepLabel: canonicalOutboundEnvelopeLabel(aad),
    }, ciphertext)).toThrow();
  });

  it("rejects RSA-3072 private PEM, even when Node can derive its public key", () => {
    const keys = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const rsaPublicPem = keys.publicKey.export({ type: "pkcs1", format: "pem" }).toString();
    const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const rsaPrivatePem = keys.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    expect(() => createInitialGuestEnvelopeSealer(publicPem, "k1")).not.toThrow();
    expect(() => createInitialGuestEnvelopeSealer(rsaPublicPem, "k1")).not.toThrow();
    for (const pem of [privatePem, rsaPrivatePem, `${publicPem}${privatePem}`]) {
      expect(() => createInitialGuestEnvelopeSealer(pem, "k1"))
        .toThrow("Initial guest encryption key must contain only public PEM material.");
    }
    expect(createInitialGuestIssuanceFromEnv({
      GUEST_ACCESS_AUTO_ISSUE_ENABLED: "true",
      OUTBOUND_MESSAGING_MODE: "test",
      GUEST_ACCESS_TRANSPORT_PUBLIC_KEY_PEM: privatePem,
      GUEST_ACCESS_TRANSPORT_KEY_VERSION: "k1",
      OUTBOUND_RECIPIENT_HMAC_KEY_BASE64: randomBytes(32).toString("base64"),
      OUTBOUND_RECIPIENT_HMAC_KEY_VERSION: "v1",
    })).toBeNull();
  });

  it("rejects weak keys, malformed recipient secrets and token entropy", () => {
    const weak = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() => createInitialGuestEnvelopeSealer(
      weak.publicKey.export({ type: "spki", format: "pem" }).toString(), "k1",
    )).toThrow();
    expect(() => createRecipientDigestFactory("AAAA", "v1")).toThrow();
    expect(() => createRecipientDigestFactory(randomBytes(32).toString("base64"), "bad")).toThrow();
    expect(() => generateGuestAccessToken(() => Buffer.alloc(31))).toThrow();
    expect(() => createRecipientDigestFactory(
      randomBytes(32).toString("base64"), "v1",
    )("0790000000")).toThrow();
  });

  it("does not create a token when transport configuration is absent or disabled", () => {
    expect(createInitialGuestIssuanceFromEnv({})).toBeNull();
    expect(createInitialGuestIssuanceFromEnv({
      GUEST_ACCESS_AUTO_ISSUE_ENABLED: "true",
      OUTBOUND_MESSAGING_MODE: "test",
    })).toBeNull();
  });
});
