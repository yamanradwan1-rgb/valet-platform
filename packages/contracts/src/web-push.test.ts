import { describe, expect, it } from "vitest";

import {
  parseWebPushEncryptedValue,
  serializeWebPushEncryptedValue,
  webPushAudienceSchema,
  WebPushEncryptedValueParseError,
  webPushEncryptedValueSchema,
  webPushLocaleSchema,
  webPushPresentationTypeSchema,
} from "./web-push";

describe("Web Push foundation contracts", () => {
  it("allows exactly the accepted presentation types, audiences, and locales", () => {
    expect(webPushPresentationTypeSchema.options).toEqual([
      "EMPLOYEE_RETRIEVAL_REQUESTED",
      "GUEST_VEHICLE_READY",
    ]);
    expect(webPushAudienceSchema.options).toEqual(["EMPLOYEE", "GUEST"]);
    expect(webPushLocaleSchema.options).toEqual(["en", "ar"]);
    expect(webPushPresentationTypeSchema.safeParse("MARKETING").success).toBe(
      false,
    );
  });

  it("keeps encrypted envelopes strict and versioned", () => {
    const envelope = {
      authTag: "a".repeat(22),
      ciphertext: "ciphertext",
      iv: "i".repeat(16),
      keyVersion: "2026-08-a",
      version: 1,
    };
    expect(webPushEncryptedValueSchema.parse(envelope)).toEqual(envelope);
    expect(
      webPushEncryptedValueSchema.safeParse({ ...envelope, plaintext: "no" })
        .success,
    ).toBe(false);
  });

  it("serializes one canonical persisted envelope representation", () => {
    const envelope = {
      authTag: "a".repeat(22),
      ciphertext: "ciphertext",
      iv: "i".repeat(16),
      keyVersion: "2026-08-a",
      version: 1 as const,
    };
    const serialized = serializeWebPushEncryptedValue(envelope);
    expect(serialized).toBe(
      '{"version":1,"keyVersion":"2026-08-a","iv":"iiiiiiiiiiiiiiii","authTag":"aaaaaaaaaaaaaaaaaaaaaa","ciphertext":"ciphertext"}',
    );
    expect(parseWebPushEncryptedValue(serialized)).toEqual(envelope);
  });

  it.each([
    "not-json",
    "null",
    "{}",
    '{"version":1}',
    '{"version":1,"keyVersion":"k","iv":"iiiiiiiiiiiiiiii","authTag":"aaaaaaaaaaaaaaaaaaaaaa","ciphertext":"ciphertext","plaintext":"no"}',
    '{ "version": 1, "keyVersion": "k", "iv": "iiiiiiiiiiiiiiii", "authTag": "aaaaaaaaaaaaaaaaaaaaaa", "ciphertext": "ciphertext" }',
  ])("fails closed for non-canonical persisted envelope %s", (serialized) => {
    expect(() => parseWebPushEncryptedValue(serialized)).toThrow(
      WebPushEncryptedValueParseError,
    );
  });
});
