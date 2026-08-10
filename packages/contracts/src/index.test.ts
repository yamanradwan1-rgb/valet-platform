import { describe, expect, it } from "vitest";

import {
  nonEmptyStringSchema,
  staffAuthAccessResponseSchema,
  staffLoginRequestSchema,
} from "./index";

describe("nonEmptyStringSchema", () => {
  it("accepts non-empty bootstrap values", () => {
    expect(nonEmptyStringSchema.parse("valet-platform")).toBe("valet-platform");
  });
});

describe("staff authentication contracts", () => {
  it("normalizes email without changing the exact password", () => {
    expect(
      staffLoginRequestSchema.parse({
        email: "  STAFF@Example.COM  ",
        password: "  exact password  ",
      }),
    ).toEqual({
      email: "staff@example.com",
      password: "  exact password  ",
    });
  });

  it("rejects authority fields and passwords beyond 1024 UTF-8 bytes", () => {
    expect(
      staffLoginRequestSchema.safeParse({
        email: "staff@example.com",
        organizationId: "client-authority",
        password: "password",
      }).success,
    ).toBe(false);
    expect(
      staffLoginRequestSchema.safeParse({
        email: "staff@example.com",
        password: "é".repeat(513),
      }).success,
    ).toBe(false);
  });

  it("locks the opaque access response shape", () => {
    expect(
      staffAuthAccessResponseSchema.parse({
        accessExpiresAt: "2026-08-10T12:15:00.000Z",
        accessToken: `vsa1.${"a".repeat(43)}`,
        sessionExpiresAt: "2026-09-09T12:00:00.000Z",
        tokenType: "Bearer",
      }),
    ).toBeDefined();
  });
});
