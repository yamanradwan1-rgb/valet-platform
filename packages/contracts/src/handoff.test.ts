import { describe, expect, it } from "vitest";

import {
  guestHandoffMaterialResponseSchema,
  handoffReasonRequestSchema,
  handoffVersionRequestSchema,
  issueHandoffVerificationRequestSchema,
  verifyDynamicQrRequestSchema,
  verifyPickupCodeRequestSchema,
} from "./handoff.js";

const sessionId = "00000000-0000-4000-8000-000000000001";

describe("secure handoff contracts", () => {
  it("accepts only the two Standard issue methods", () => {
    expect(
      issueHandoffVerificationRequestSchema.parse({ method: "PICKUP_CODE" }),
    ).toEqual({ method: "PICKUP_CODE" });
    expect(
      issueHandoffVerificationRequestSchema.parse({ method: "DYNAMIC_QR" }),
    ).toEqual({ method: "DYNAMIC_QR" });
    expect(() =>
      issueHandoffVerificationRequestSchema.parse({
        method: "SUPERVISOR_OVERRIDE",
      }),
    ).toThrow();
  });

  it("requires exact proof formats", () => {
    expect(
      verifyPickupCodeRequestSchema.parse({
        expectedSessionVersion: 8,
        pickupCode: "0042",
      }),
    ).toMatchObject({ pickupCode: "0042" });
    expect(() =>
      verifyPickupCodeRequestSchema.parse({
        expectedSessionVersion: 8,
        pickupCode: "42",
      }),
    ).toThrow();
    expect(
      verifyDynamicQrRequestSchema.parse({
        expectedSessionVersion: 8,
        qrPayload: `vhq1.${"A".repeat(43)}`,
      }),
    ).toMatchObject({ qrPayload: expect.stringMatching(/^vhq1\./) });
  });

  it("keeps staff authority input minimal and reasons bounded", () => {
    expect(
      handoffVersionRequestSchema.parse({ expectedSessionVersion: 8 }),
    ).toEqual({ expectedSessionVersion: 8 });
    expect(() =>
      handoffVersionRequestSchema.parse({
        expectedSessionVersion: 8,
        organizationId: sessionId,
      }),
    ).toThrow();
    expect(
      handoffReasonRequestSchema.parse({
        expectedSessionVersion: 8,
        reason: "  guest left  ",
      }),
    ).toEqual({ expectedSessionVersion: 8, reason: "guest left" });
    expect(() =>
      handoffReasonRequestSchema.parse({
        expectedSessionVersion: 8,
        reason: "x".repeat(501),
      }),
    ).toThrow();
  });

  it("returns one discriminated guest secret without internal fields", () => {
    expect(
      guestHandoffMaterialResponseSchema.parse({
        expiresAt: "2026-08-13T12:02:00.000Z",
        method: "DYNAMIC_QR",
        qrPayload: `vhq1.${"A".repeat(43)}`,
        state: "HANDOFF_PENDING",
        valetSessionId: sessionId,
      }),
    ).toMatchObject({ method: "DYNAMIC_QR" });
    expect(() =>
      guestHandoffMaterialResponseSchema.parse({
        expiresAt: "2026-08-13T12:10:00.000Z",
        method: "PICKUP_CODE",
        pickupCode: "1234",
        state: "HANDOFF_PENDING",
        taskId: sessionId,
        valetSessionId: sessionId,
      }),
    ).toThrow();
  });
});
