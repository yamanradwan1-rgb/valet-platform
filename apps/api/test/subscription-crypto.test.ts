import { describe, expect, it } from "vitest";

import {
  decryptWebPushValue,
  encryptWebPushValue,
  fingerprintWebPushEndpoint,
  WebPushDecryptionError,
} from "../src/common/web-push/subscription-crypto";

const active = { key: Buffer.alloc(32, 1), version: "active" };
const previous = { key: Buffer.alloc(32, 2), version: "previous" };

describe("Web Push subscription credential encryption", () => {
  it("creates a stable keyed non-reversible endpoint fingerprint", () => {
    const endpoint = "https://push.example/private-capability";
    const fingerprint = fingerprintWebPushEndpoint(endpoint, active.key);
    expect(fingerprint).toMatch(/^hmac-sha256:v1:[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain(endpoint);
    expect(fingerprintWebPushEndpoint(endpoint, active.key)).toBe(fingerprint);
    expect(fingerprintWebPushEndpoint(endpoint, previous.key)).not.toBe(
      fingerprint,
    );
  });

  it("round trips using authenticated AES-256-GCM and the active key", () => {
    const envelope = encryptWebPushValue("https://push.example/x", { active });
    expect(envelope.keyVersion).toBe("active");
    expect(envelope.ciphertext).not.toContain("push.example");
    expect(decryptWebPushValue(envelope, { active })).toBe(
      "https://push.example/x",
    );
  });

  it("decrypts a previous-key envelope during a bounded rotation", () => {
    const envelope = encryptWebPushValue("secret", { active: previous });
    expect(decryptWebPushValue(envelope, { active, previous })).toBe("secret");
  });

  it("fails closed for unknown, malformed, or tampered ciphertext", () => {
    const envelope = encryptWebPushValue("secret", { active });
    expect(() =>
      decryptWebPushValue({ ...envelope, keyVersion: "unknown" }, { active }),
    ).toThrow(WebPushDecryptionError);
    expect(() =>
      decryptWebPushValue({ ...envelope, authTag: "a".repeat(22) }, { active }),
    ).toThrow(WebPushDecryptionError);
    expect(() =>
      decryptWebPushValue({ ...envelope, ciphertext: "not-valid" }, { active }),
    ).toThrow(WebPushDecryptionError);
  });
});
