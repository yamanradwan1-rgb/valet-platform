import { describe, expect, it } from "vitest";
import {
  staffActivationRequestSchema,
  staffActivationResponseSchema,
  staffPendingInvitationSchema,
  staffPasswordCreationSchema,
} from "./staff-activation.js";
import {
  staffDirectoryQuerySchema,
  staffManagementStatusSchema,
} from "./staff-management.js";

describe("T05-D strict neutral contracts", () => {
  const request = {
    inviteToken: `vsi1.${"a".repeat(43)}`,
    password: "existing password",
  };
  it("accepts one bounded token/password without mode or identity", () => {
    expect(staffActivationRequestSchema.safeParse(request).success).toBe(true);
    for (const key of [
      "email",
      "organizationId",
      "membershipId",
      "userId",
      "role",
      "existingAccount",
      "mode",
    ]) {
      expect(
        staffActivationRequestSchema.safeParse({ ...request, [key]: "x" })
          .success,
      ).toBe(false);
    }
    for (const inviteToken of [
      "",
      "vsi1.short",
      `${request.inviteToken}x`,
      `vsa1.${"a".repeat(43)}`,
    ]) {
      expect(
        staffActivationRequestSchema.safeParse({ ...request, inviteToken })
          .success,
      ).toBe(false);
    }
    for (const password of ["", "a".repeat(1025), "🙂".repeat(257)]) {
      expect(
        staffActivationRequestSchema.safeParse({ ...request, password })
          .success,
      ).toBe(false);
    }
    expect(
      staffActivationRequestSchema.safeParse({
        ...request,
        password: "🙂".repeat(256),
      }).success,
    ).toBe(true);
  });
  it("uses provisioning creation bounds without weakening existing proof", () => {
    for (const password of [
      "a".repeat(14),
      "a".repeat(129),
      "valid-long-password\n",
    ])
      expect(staffPasswordCreationSchema.safeParse(password).success).toBe(
        false,
      );
    expect(staffPasswordCreationSchema.safeParse("🙂".repeat(15)).success).toBe(
      true,
    );
    expect(
      staffActivationRequestSchema.safeParse({ ...request, password: "short" })
        .success,
    ).toBe(true);
  });
  it("has minimal strict terminal results", () => {
    for (const outcome of ["ACTIVATED", "ALREADY_ACTIVATED"]) {
      expect(staffActivationResponseSchema.safeParse({ outcome }).success).toBe(
        true,
      );
      expect(
        staffActivationResponseSchema.safeParse({ outcome, accessToken: "x" })
          .success,
      ).toBe(false);
    }
  });
  it("keeps pending read separate from ordinary desired status", () => {
    expect(
      staffDirectoryQuerySchema.safeParse({ status: "PENDING" }).success,
    ).toBe(true);
    expect(staffManagementStatusSchema.safeParse("PENDING").success).toBe(
      false,
    );
    const facts = {
      generation: 1,
      expiresAt: "2026-10-01T12:00:00Z",
      state: "EXPIRED",
    };
    expect(staffPendingInvitationSchema.safeParse(facts).success).toBe(true);
    expect(
      staffPendingInvitationSchema.safeParse({ ...facts, tokenHash: "x" })
        .success,
    ).toBe(false);
    expect(
      staffPendingInvitationSchema.safeParse({ ...facts, generation: 0 })
        .success,
    ).toBe(false);
  });
});
