import { describe, expect, it } from "vitest";

import {
  parseWebPushEncryptedValue,
  serializeWebPushEncryptedValue,
  webPushAudienceSchema,
  WebPushEncryptedValueParseError,
  webPushEncryptedValueSchema,
  webPushLocaleSchema,
  webPushPayloadSchema,
  webPushPresentationTypeSchema,
  webPushSubscriptionRequestSchema,
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

  it("accepts only the strict versioned presentation payload", () => {
    const payload = {
      audience: "EMPLOYEE",
      body: "A new retrieval request is waiting in the task queue.",
      direction: "ltr",
      identity: "10000000-0000-4000-8000-000000000001",
      locale: "en",
      presentationType: "EMPLOYEE_RETRIEVAL_REQUESTED",
      route: "TASKS",
      title: "New retrieval request",
      version: 1,
    };
    expect(webPushPayloadSchema.safeParse(payload).success).toBe(true);
    expect(
      webPushPayloadSchema.safeParse({ ...payload, token: "forbidden" })
        .success,
    ).toBe(false);
    expect(
      webPushPayloadSchema.safeParse({ ...payload, direction: "rtl" }).success,
    ).toBe(false);
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

describe("Web Push subscription transport", () => {
  const valid = {
    auth: Buffer.alloc(16, 7).toString("base64url"),
    browserExpiresAt: "2026-09-01T00:00:00.000Z",
    endpoint: "https://push.example.test/subscription?id=opaque",
    locale: "ar",
    p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]).toString(
      "base64url",
    ),
  };

  it("accepts only browser presentation and credential material", () => {
    expect(webPushSubscriptionRequestSchema.parse(valid)).toEqual(valid);
    expect(
      webPushSubscriptionRequestSchema.safeParse({
        ...valid,
        staffAuthSessionId: "fef11499-51df-45de-9053-a874005576e1",
      }).success,
    ).toBe(false);
  });

  it.each([
    { ...valid, endpoint: "http://push.example.test/subscription" },
    { ...valid, endpoint: "https://user@push.example.test/subscription" },
    { ...valid, endpoint: "https://push.example.test/subscription#secret" },
    { ...valid, auth: "short" },
    { ...valid, p256dh: Buffer.alloc(65, 8).toString("base64url") },
    { ...valid, locale: "fr" },
  ])("rejects malformed subscription material", (candidate) => {
    expect(webPushSubscriptionRequestSchema.safeParse(candidate).success).toBe(
      false,
    );
  });
});
