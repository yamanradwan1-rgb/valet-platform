import { describe, expect, it } from "vitest";

import {
  webPushAudienceSchema,
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
});
