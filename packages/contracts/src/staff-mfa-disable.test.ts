import { describe, expect, it } from "vitest";
import {
  staffMfaDisableAvailabilitySchema as availability,
  staffMfaDisableRequestSchema as request,
  staffMfaDisableResponseSchema as response,
  staffMfaStateResponseSchema as state,
} from "./staff-mfa.js";
const id = "00000000-0000-4000-8000-000000000001";
describe("Issue 408 strict additive contracts", () => {
  it.each([
    { availability: "AVAILABLE", expectedFactorId: id },
    { availability: "MFA_REQUIRED_BY_POLICY" },
    { availability: "MFA_NOT_ENABLED" },
  ])("accepts %j", (value) => expect(availability.parse(value)).toEqual(value));
  it.each([
    { availability: "AVAILABLE" },
    { availability: "MFA_NOT_ENABLED", expectedFactorId: id },
    { availability: "AVAILABLE", expectedFactorId: id, userId: id },
    { availability: "DISABLED" },
  ])("rejects %j", (value) =>
    expect(availability.safeParse(value).success).toBe(false),
  );
  it("requires exact fresh-proof transport and no caller authority", () => {
    expect(request.parse({ expectedFactorId: id, code: "123456" })).toEqual({
      expectedFactorId: id,
      code: "123456",
    });
    for (const extra of [
      "userId",
      "organizationId",
      "locationId",
      "recoveryCode",
      "operationId",
    ])
      expect(
        request.safeParse({ expectedFactorId: id, code: "123456", [extra]: id })
          .success,
      ).toBe(false);
    expect(
      request.safeParse({ expectedFactorId: id, code: "１２３４５６" }).success,
    ).toBe(false);
    expect(response.parse({ state: "ENROLLMENT_REQUIRED" })).toEqual({
      state: "ENROLLMENT_REQUIRED",
    });
    expect(
      state.safeParse({ state: "ASSURED", expectedFactorId: id }).success,
    ).toBe(false);
  });
});
