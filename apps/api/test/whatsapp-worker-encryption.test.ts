import {
  constants, generateKeyPairSync, publicEncrypt,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OutboundEnvelopeAAD } from "../src/modules/notifications/contracts/outbound-envelope";
import {
  createOutboundEnvelopeOpener, senderEnvelopeOpenerFromEnv,
} from "../src/modules/notifications/worker/outbound-worker-envelope-opener";
import { senderRecipientDigestFromEnv } from "../src/modules/notifications/worker/outbound-worker-recipient-digest";

const aad: OutboundEnvelopeAAD = {
  version: 1,
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
  customerId: "44444444-4444-4444-8444-444444444444",
  intentId: "55555555-5555-4555-8555-555555555555",
  credentialGeneration: 1,
  recipientDigest: "hmac:v1:" + "T".repeat(43),
  expiresAt: "2026-10-16T23:00:00.000Z",
};

/** Mirrors W2 issuer order to prove RSA OAEP-SHA256 interoperability. */
function issuanceLabel(input: OutboundEnvelopeAAD): Buffer {
  return Buffer.from(JSON.stringify({
    version: input.version,
    organizationId: input.organizationId,
    locationId: input.locationId,
    sessionId: input.sessionId,
    customerId: input.customerId,
    intentId: input.intentId,
    credentialGeneration: input.credentialGeneration,
    recipientDigest: input.recipientDigest,
    expiresAt: input.expiresAt,
  }), "utf8");
}

describe("WhatsApp sender-only envelope and recipient HMAC", () => {
  it("decrypts the W2-compatible RSA OAEP authenticated label and rejects tampering", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
    const token = "A".repeat(43);
    const encrypted = publicEncrypt({
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
      oaepLabel: issuanceLabel(aad),
    }, Buffer.from(token));
    const sealed = {
      algorithm: "RSA-OAEP-SHA256" as const,
      keyVersion: "fixture-v1",
      ciphertext: encrypted,
      aad,
      purgeAt: new Date(Date.now() + 60_000),
    };
    const opener = createOutboundEnvelopeOpener(
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      "fixture-v1",
    );
    expect(opener.open(sealed, aad)).toBe(token);
    expect(() => opener.open(sealed, { ...aad, sessionId: aad.customerId }))
      .toThrow("OUTBOUND_ENVELOPE_AUTH_FAILED");
    expect(() => opener.open({ ...sealed, keyVersion: "other" }, aad))
      .toThrow("OUTBOUND_ENVELOPE_AUTH_FAILED");
    expect(() => opener.open({ ...sealed, ciphertext: Buffer.alloc(384) }, aad))
      .toThrow("OUTBOUND_ENVELOPE_AUTH_FAILED");
    expect(() => opener.open({ ...sealed, purgeAt: new Date(0) }, aad))
      .toThrow("OUTBOUND_ENVELOPE_AUTH_FAILED");
  });

  it("requires an isolated private key and exact key version at startup", () => {
    expect(() => senderEnvelopeOpenerFromEnv({})).toThrow("OUTBOUND_SENDER_KEY_NOT_READY");
    expect(() => createOutboundEnvelopeOpener("bad PEM", "v1"))
      .toThrow("OUTBOUND_SENDER_KEY_INVALID");
    expect(() => createOutboundEnvelopeOpener("invalid", "invalid version"))
      .toThrow("OUTBOUND_SENDER_KEY_VERSION_INVALID");
  });

  it("uses the issuer's versioned keyed HMAC format for immutable consent checks", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const digest = senderRecipientDigestFromEnv({
      OUTBOUND_RECIPIENT_HMAC_KEY_BASE64: key,
      OUTBOUND_RECIPIENT_HMAC_KEY_VERSION: "v1",
    });
    expect(digest("+962799123456")).toMatch(/^hmac:v1:[A-Za-z0-9_-]{43}$/);
    expect(digest("+962799123456")).toBe(digest("+962799123456"));
    expect(digest("+962799123456")).not.toBe(digest("+962799123457"));
    expect(() => digest("invalid")).toThrow("OUTBOUND_SENDER_RECIPIENT_INVALID");
    expect(() => senderRecipientDigestFromEnv({}))
      .toThrow("OUTBOUND_SENDER_DIGEST_KEY_NOT_READY");
  });
});
