import { describe, expect, it } from "vitest";

import {
  guestAccessIssueResponseSchema,
  guestAccessRawTokenSchema,
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
