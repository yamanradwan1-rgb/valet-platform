import { describe, expect, it } from "vitest";
import {
  parseWebPushEncryptedValue,
  serializeWebPushEncryptedValue,
} from "@valet/contracts";

import {
  createWebPushCredentialContext,
  decryptWebPushCredentials,
  decryptWebPushValue,
  encryptWebPushCredentials,
  encryptWebPushValue,
  fingerprintWebPushEndpoint,
  WebPushDecryptionError,
} from "../src/common/web-push/subscription-crypto";

const active = { key: Buffer.alloc(32, 1), version: "active" };
const previous = { key: Buffer.alloc(32, 2), version: "previous" };
const subscriptionA = "3f336331-d5ae-48e0-8674-8548f7157781";
const subscriptionB = "c9c1ce9f-fd37-4c71-bd71-4c765e4f9879";
const endpointA = createWebPushCredentialContext(subscriptionA, "ENDPOINT");

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
    const persisted = encryptWebPushValue(
      "https://push.example/x",
      { active },
      endpointA,
    );
    expect(persisted).not.toContain("push.example");
    expect(
      decryptWebPushValue(persisted, { active }, endpointA, "active"),
    ).toBe("https://push.example/x");
  });

  it("decrypts a previous-key envelope during a bounded rotation", () => {
    const persisted = encryptWebPushValue(
      "secret",
      { active: previous },
      endpointA,
    );
    expect(
      decryptWebPushValue(
        persisted,
        { active, previous },
        endpointA,
        "previous",
      ),
    ).toBe("secret");
  });

  it("fails closed for unknown, malformed, or tampered ciphertext", () => {
    const persisted = encryptWebPushValue("secret", { active }, endpointA);
    expect(() =>
      decryptWebPushValue(persisted, { active }, endpointA, "unknown"),
    ).toThrow(WebPushDecryptionError);
    expect(() =>
      decryptWebPushValue("not-json", { active }, endpointA, "active"),
    ).toThrow(WebPushDecryptionError);
    const envelope = parseWebPushEncryptedValue(persisted);
    const tampered = serializeWebPushEncryptedValue({
      ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, -1)}A`,
    });
    expect(() =>
      decryptWebPushValue(tampered, { active }, endpointA, "active"),
    ).toThrow(WebPushDecryptionError);
  });

  it("rejects credential fields outside the closed AAD contract", () => {
    expect(() =>
      createWebPushCredentialContext(
        subscriptionA,
        "OTHER" as unknown as "AUTH",
      ),
    ).toThrow(/context is invalid/);
  });

  it("rejects ciphertext transplanted across rows or credential fields", () => {
    const persisted = encryptWebPushValue("secret", { active }, endpointA);
    for (const context of [
      createWebPushCredentialContext(subscriptionB, "ENDPOINT"),
      createWebPushCredentialContext(subscriptionA, "P256DH"),
      createWebPushCredentialContext(subscriptionA, "AUTH"),
    ]) {
      expect(() =>
        decryptWebPushValue(persisted, { active }, context, "active"),
      ).toThrow(WebPushDecryptionError);
    }
  });

  it("supports coherent re-encryption for the same row and field", () => {
    const oldPersisted = encryptWebPushValue(
      "secret",
      { active: previous },
      endpointA,
    );
    const plaintext = decryptWebPushValue(
      oldPersisted,
      { active, previous },
      endpointA,
      "previous",
    );
    const rotated = encryptWebPushValue(plaintext, { active }, endpointA);
    expect(decryptWebPushValue(rotated, { active }, endpointA, "active")).toBe(
      "secret",
    );
  });

  it("encrypts and decrypts a complete row under one key version", () => {
    const persisted = encryptWebPushCredentials(
      {
        auth: "auth-secret",
        endpoint: "https://push.example/row",
        p256dh: "p256dh-secret",
        subscriptionId: subscriptionA,
      },
      { active },
    );
    expect(persisted.encryptionKeyVersion).toBe("active");
    expect(
      decryptWebPushCredentials(
        { ...persisted, subscriptionId: subscriptionA },
        { active },
      ),
    ).toEqual({
      auth: "auth-secret",
      endpoint: "https://push.example/row",
      p256dh: "p256dh-secret",
    });
    expect(() =>
      decryptWebPushCredentials(
        { ...persisted, subscriptionId: subscriptionB },
        { active },
      ),
    ).toThrow(WebPushDecryptionError);
  });

  it("rejects a mixed-version credential row", () => {
    const activeRow = encryptWebPushCredentials(
      {
        auth: "auth-secret",
        endpoint: "https://push.example/row",
        p256dh: "p256dh-secret",
        subscriptionId: subscriptionA,
      },
      { active },
    );
    const previousAuth = encryptWebPushValue(
      "auth-secret",
      { active: previous },
      createWebPushCredentialContext(subscriptionA, "AUTH"),
    );
    expect(() =>
      decryptWebPushCredentials(
        {
          ...activeRow,
          authCiphertext: previousAuth,
          subscriptionId: subscriptionA,
        },
        { active, previous },
      ),
    ).toThrow(WebPushDecryptionError);
  });
});
