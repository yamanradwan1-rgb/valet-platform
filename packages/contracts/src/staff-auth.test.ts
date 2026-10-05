import { describe, expect, it } from "vitest";

import {
  staffNativeAuthResponseSchema,
  staffNativeLogoutRequestSchema,
  staffNativeRefreshRequestSchema,
  staffAuthAccessResponseSchema,
} from "./staff-auth";

const accessToken = `vsa1.${"a".repeat(43)}`;
const refreshToken = `vsr1.${"b".repeat(43)}`;

describe("native Staff authentication contracts", () => {
  it.each([staffAuthAccessResponseSchema, staffNativeAuthResponseSchema])(
    "requires a UUID continuity ID without accepting it as request authority",
    (schema) => {
      const response = {
        accessToken,
        tokenType: "Bearer",
        accessExpiresAt: "2026-09-03T12:15:00.000Z",
        sessionExpiresAt: "2026-10-03T12:00:00.000Z",
        ...(schema === staffNativeAuthResponseSchema ? { refreshToken } : {}),
      };
      expect(schema.safeParse(response).success).toBe(false);
      expect(
        schema.safeParse({ ...response, staffAuthSessionId: "not-uuid" })
          .success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...response,
          staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
        }).success,
      ).toBe(true);
      expect(
        staffNativeRefreshRequestSchema.safeParse({
          refreshToken,
          staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
        }).success,
      ).toBe(false);
    },
  );
  it("accepts exactly the native token response shape", () => {
    expect(
      staffNativeAuthResponseSchema.parse({
        accessExpiresAt: "2026-09-03T12:15:00.000Z",
        accessToken,
        refreshToken,
        sessionExpiresAt: "2026-10-03T12:00:00.000Z",
        staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
        tokenType: "Bearer",
      }),
    ).toEqual({
      accessExpiresAt: "2026-09-03T12:15:00.000Z",
      accessToken,
      refreshToken,
      sessionExpiresAt: "2026-10-03T12:00:00.000Z",
      staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
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
      staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
      tokenType: "Bearer",
    });
    expect(result.success).toBe(false);
  });
});
