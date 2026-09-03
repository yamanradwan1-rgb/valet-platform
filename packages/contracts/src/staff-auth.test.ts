import { describe, expect, it } from "vitest";

import {
  staffNativeAuthResponseSchema,
  staffNativeLogoutRequestSchema,
  staffNativeRefreshRequestSchema,
} from "./staff-auth";

const accessToken = `vsa1.${"a".repeat(43)}`;
const refreshToken = `vsr1.${"b".repeat(43)}`;

describe("native Staff authentication contracts", () => {
  it("accepts exactly the native token response shape", () => {
    expect(
      staffNativeAuthResponseSchema.parse({
        accessExpiresAt: "2026-09-03T12:15:00.000Z",
        accessToken,
        refreshToken,
        sessionExpiresAt: "2026-10-03T12:00:00.000Z",
        tokenType: "Bearer",
      }),
    ).toEqual({
      accessExpiresAt: "2026-09-03T12:15:00.000Z",
      accessToken,
      refreshToken,
      sessionExpiresAt: "2026-10-03T12:00:00.000Z",
      tokenType: "Bearer",
    });
  });

  it.each([staffNativeRefreshRequestSchema, staffNativeLogoutRequestSchema])(
    "accepts exactly one native refresh credential",
    (schema) => {
      expect(schema.parse({ refreshToken })).toEqual({ refreshToken });
      expect(
        schema.safeParse({ refreshToken, userId: "not-authority" }).success,
      ).toBe(false);
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ refreshToken: "invalid" }).success).toBe(false);
    },
  );

  it("rejects authority and device fields from native responses", () => {
    const result = staffNativeAuthResponseSchema.safeParse({
      accessExpiresAt: "2026-09-03T12:15:00.000Z",
      accessToken,
      deviceId: "device-is-not-authority",
      refreshToken,
      sessionExpiresAt: "2026-10-03T12:00:00.000Z",
      tokenType: "Bearer",
    });
    expect(result.success).toBe(false);
  });
});
