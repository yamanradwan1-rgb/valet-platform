import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  staffAuthAccessResponseSchema,
  staffNativeAuthResponseSchema,
  staffNativeLogoutRequestSchema,
  staffNativeRefreshRequestSchema,
  staffAuthSessionContinuitySchema,
} from "./staff-auth";

const web = {
  accessToken: `vsa1.${"a".repeat(43)}`,
  tokenType: "Bearer",
  accessExpiresAt: "2026-09-03T12:15:00.000Z",
  sessionExpiresAt: "2026-10-03T12:00:00.000Z",
};
const refreshToken = `vsr1.${"b".repeat(43)}`;
// Frozen prior-client schemas, independent of the new shared response schemas.
const oldStrictWeb = z
  .object({
    accessToken: z.string().regex(/^vsa1\.[A-Za-z0-9_-]{43}$/),
    tokenType: z.literal("Bearer"),
    accessExpiresAt: z.string().datetime({ offset: true }),
    sessionExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
const oldStrictNative = oldStrictWeb
  .extend({ refreshToken: z.string().regex(/^vsr1\.[A-Za-z0-9_-]{43}$/) })
  .strict();

describe("legacy strict Staff response body compatibility", () => {
  it("new shared Web body parses with the old strict client", () => {
    const parsed = staffAuthAccessResponseSchema.parse(web);
    expect(oldStrictWeb.parse(parsed)).toEqual(web);
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(web).sort());
    expect(
      staffAuthAccessResponseSchema.safeParse({
        ...web,
        staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
      }).success,
    ).toBe(false);
  });
  it("new shared Native body parses with the old strict client", () => {
    const parsed = staffNativeAuthResponseSchema.parse({
      ...web,
      refreshToken,
    });
    expect(oldStrictNative.parse(parsed)).toEqual({ ...web, refreshToken });
    expect(Object.keys(parsed).sort()).toEqual(
      [...Object.keys(web), "refreshToken"].sort(),
    );
    expect(
      staffNativeAuthResponseSchema.safeParse({
        ...parsed,
        staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
      }).success,
    ).toBe(false);
    for (const extra of [
      { deviceId: "not-authority" },
      { userId: "not-authority" },
    ])
      expect(
        staffNativeAuthResponseSchema.safeParse({ ...parsed, ...extra })
          .success,
      ).toBe(false);
  });
  it("validates continuity separately without accepting it as request authority", () => {
    expect(
      staffAuthSessionContinuitySchema.safeParse(
        "88888888-8888-4888-8888-888888888888",
      ).success,
    ).toBe(true);
    for (const value of [null, "", "not-uuid", "Bearer token", "uuid,uuid"])
      expect(staffAuthSessionContinuitySchema.safeParse(value).success).toBe(
        false,
      );
    expect(
      staffNativeRefreshRequestSchema.safeParse({
        refreshToken,
        staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
      }).success,
    ).toBe(false);
  });
  it.each([staffNativeRefreshRequestSchema, staffNativeLogoutRequestSchema])(
    "keeps strict Native credential requests",
    (schema) => {
      expect(schema.parse({ refreshToken })).toEqual({ refreshToken });
      for (const body of [
        {},
        { refreshToken: "invalid" },
        { refreshToken, userId: "not-authority" },
      ])
        expect(schema.safeParse(body).success).toBe(false);
    },
  );
});
