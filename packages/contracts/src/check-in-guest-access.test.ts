import { describe, expect, it } from "vitest";

import {
  guestAccessIssueResponseSchema,
  guestAccessRawTokenSchema,
  guestSafeSessionResponseSchema,
} from "./check-in.js";

function issuePayload(rawToken: string) {
  return {
    expiresAt: "2026-08-22T18:05:00.000Z",
    issuedAt: "2026-08-21T18:05:00.000Z",
    mutationKind: "ISSUED" as const,
    rawToken,
    valetSessionId: "22222222-2222-4222-8222-222222222222",
  };
}

describe("guestAccessIssueResponse raw token contract", () => {
  it("accepts an exact 43-character base64url raw token", () => {
    const rawToken = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_";
    expect(rawToken).toHaveLength(43);
    expect(guestAccessRawTokenSchema.parse(rawToken)).toBe(rawToken);
    expect(guestAccessIssueResponseSchema.parse(issuePayload(rawToken)))
      .toEqual(issuePayload(rawToken));
  });

  it("rejects tokens that are too short or too long", () => {
    expect(guestAccessRawTokenSchema.safeParse("a".repeat(42)).success).toBe(
      false,
    );
    expect(guestAccessRawTokenSchema.safeParse("a".repeat(44)).success).toBe(
      false,
    );
    expect(guestAccessRawTokenSchema.safeParse("").success).toBe(false);
  });

  it("rejects non-base64url characters and padded forms", () => {
    expect(guestAccessRawTokenSchema.safeParse("a".repeat(42) + "+").success)
      .toBe(false);
    expect(guestAccessRawTokenSchema.safeParse("a".repeat(42) + "/").success)
      .toBe(false);
    expect(guestAccessRawTokenSchema.safeParse("a".repeat(42) + "=").success)
      .toBe(false);
  });

  it("rejects a non-string credential material", () => {
    expect(guestAccessRawTokenSchema.safeParse(null).success).toBe(false);
    expect(guestAccessRawTokenSchema.safeParse(12345).success).toBe(false);
  });
});

describe("guestSafeSessionResponse readyAt contract", () => {
  const session = {
    readyAt: null,
    state: "RETRIEVING" as const,
    valetSessionId: "22222222-2222-4222-8222-222222222222",
    vehicle: { color: "Black", make: "Toyota", model: "Camry" },
  };

  it("accepts null and a canonical UTC timestamp", () => {
    expect(guestSafeSessionResponseSchema.parse(session)).toEqual(session);
    expect(
      guestSafeSessionResponseSchema.parse({
        ...session,
        readyAt: "2026-08-29T12:34:56.789Z",
      }).readyAt,
    ).toBe("2026-08-29T12:34:56.789Z");
  });

  it("rejects malformed timestamps and unapproved fields", () => {
    expect(
      guestSafeSessionResponseSchema.safeParse({
        ...session,
        readyAt: "2026-08-29 12:34:56",
      }).success,
    ).toBe(false);
    expect(
      guestSafeSessionResponseSchema.safeParse({
        ...session,
        organizationId: "33333333-3333-4333-8333-333333333333",
      }).success,
    ).toBe(false);
  });
});
