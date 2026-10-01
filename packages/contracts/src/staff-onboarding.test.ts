import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  staffOnboardingCreateSchema,
  staffOnboardingResendSchema,
  staffOnboardingResultSchema,
} from "./staff-onboarding.js";

const command = {
  operationId: randomUUID(),
  firstName: "  ليلى  ",
  lastName: "  O’Neill  ",
  email: " STAFF@EXAMPLE.COM ",
  role: "VALET_EMPLOYEE",
  locationIds: [randomUUID()],
};

describe("staff onboarding strict contracts", () => {
  it("preserves canonical names and staff-auth email normalization", () => {
    expect(staffOnboardingCreateSchema.parse(command)).toMatchObject({
      firstName: "ليلى",
      lastName: "O’Neill",
      email: "staff@example.com",
    });
    expect(
      staffOnboardingCreateSchema.safeParse({
        ...command,
        firstName: "𐐀".repeat(100),
      }).success,
    ).toBe(true);
  });

  it("rejects invalid/missing identity, IDs, roles and authority/credential fields", () => {
    for (const patch of [
      { firstName: undefined },
      { lastName: undefined },
      { firstName: "  " },
      { lastName: "a".repeat(101) },
      { email: "invalid" },
      { operationId: "invalid" },
      { role: "ORG_ADMIN" },
      { password: "forbidden" },
      { userId: randomUUID() },
      { membershipId: randomUUID() },
      { unknown: true },
    ]) {
      expect(
        staffOnboardingCreateSchema.safeParse({ ...command, ...patch }).success,
      ).toBe(false);
    }
    for (const role of [
      "LOCATION_MANAGER",
      "VALET_SUPERVISOR",
      "VALET_EMPLOYEE",
    ]) {
      expect(
        staffOnboardingCreateSchema.safeParse({ ...command, role }).success,
      ).toBe(true);
    }
  });

  it("bounds initial grants and rejects duplicate UUID representations", () => {
    for (const locationIds of [
      [],
      ["invalid"],
      Array.from({ length: 51 }, () => randomUUID()),
      [command.locationIds[0], command.locationIds[0]!.toUpperCase()],
    ]) {
      expect(
        staffOnboardingCreateSchema.safeParse({ ...command, locationIds })
          .success,
      ).toBe(false);
    }
    expect(
      staffOnboardingCreateSchema.safeParse({
        ...command,
        locationIds: Array.from({ length: 50 }, () => randomUUID()),
      }).success,
    ).toBe(true);
  });

  it("requires a fresh link and forbids a link/account disclosure on reconciliation", () => {
    const facts = {
      membershipId: randomUUID(),
      invitationId: randomUUID(),
      generation: 1,
      expiresAt: "2026-10-02T00:00:00Z",
    };
    const replay = { ...facts, outcome: "INVITE_PENDING_LINK_UNAVAILABLE" };
    expect(staffOnboardingResultSchema.safeParse(replay).success).toBe(true);
    expect(
      staffOnboardingResultSchema.safeParse({
        ...facts,
        outcome: "INVITE_ISSUED",
      }).success,
    ).toBe(false);
    expect(
      staffOnboardingResultSchema.safeParse({
        ...replay,
        activationLink: "https://staff.test/",
      }).success,
    ).toBe(false);
    for (const patch of [
      { existingAccount: true },
      { generation: 0 },
      { membershipId: "invalid" },
      { invitationId: "invalid" },
      { expiresAt: "tomorrow" },
    ]) {
      expect(
        staffOnboardingResultSchema.safeParse({ ...replay, ...patch }).success,
      ).toBe(false);
    }
  });

  it("resend accepts only a stable UUID operation", () => {
    expect(
      staffOnboardingResendSchema.safeParse({ operationId: randomUUID() })
        .success,
    ).toBe(true);
    for (const body of [
      {},
      { operationId: "invalid" },
      { operationId: randomUUID(), resend: true },
    ]) {
      expect(staffOnboardingResendSchema.safeParse(body).success).toBe(false);
    }
  });
});
