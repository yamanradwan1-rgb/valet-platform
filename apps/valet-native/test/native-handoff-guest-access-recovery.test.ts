import type { EmployeeHandoffSnapshot } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";
import { nativeHandoffGuestAccessRecoveryTarget } from "../src/handoff/native-handoff-guest-access-recovery";
import {
  NATIVE_HANDOFF_GUEST_ACCESS_RECOVERY_UI_ENABLED,
  openHandoffGuestAccessRecovery,
} from "../src/shell/native-production-workflow-navigation";

const sessionId = "44444444-4444-4444-8444-444444444444";
const locationId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

function snapshot(): EmployeeHandoffSnapshot {
  return {
    failure: null,
    identityGeneration: 3,
    phase: "pending",
    scope: {
      locationCode: "AMM",
      locationId,
      locationName: "Amman",
      membershipId: memberId,
      organizationId: "33333333-3333-4333-8333-333333333333",
      organizationName: "Operator",
      role: "VALET_EMPLOYEE",
      shiftId: "55555555-5555-4555-8555-555555555555",
      shiftStartedAt: "2026-10-08T18:00:00.000Z",
    },
    session: {
      checkIn: { conditionCompletedAt: "2026-10-08T18:01:00.000Z" },
      guestAccess: {
        expiresAt: "2026-10-09T18:01:00.000Z",
        revokedAt: null,
        status: "ACTIVE",
      },
      handoff: {
        pendingAt: "2026-10-08T19:00:00.000Z",
        verification: null,
      },
      keySlot: { code: "K-9" },
      locationId,
      parking: {
        parkedAt: "2026-10-08T18:10:00.000Z",
        parkingSpotCode: null,
        parkingStartedAt: "2026-10-08T18:05:00.000Z",
        parkingZoneCode: null,
      },
      sessionId,
      state: "HANDOFF_PENDING",
      vehicle: {
        color: "Black",
        make: "Toyota",
        model: "Camry",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId: "77777777-7777-4777-8777-777777777777",
        vehicleUpdatedAt: "2026-10-08T18:00:00.000Z",
      },
      version: 8,
    },
    task: {
      createdAt: "2026-10-08T18:30:00.000Z",
      currentAssigneeMembershipId: memberId,
      parkingSpot: null,
      parkingZone: null,
      retrievalRequestedAt: "2026-10-08T18:30:00.000Z",
      sessionId,
      status: "IN_PROGRESS",
      taskId: "66666666-6666-4666-8666-666666666666",
      taskType: "RETRIEVAL",
      valetSessionState: "HANDOFF_PENDING",
      valetSessionVersion: 8,
      vehicle: {
        color: "Black",
        make: "Toyota",
        model: "Camry",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
      },
      version: 4,
    },
  };
}

describe("T5 Native contextual Guest Access recovery", () => {
  it("derives only the exact active HANDOFF session", () => {
    expect(nativeHandoffGuestAccessRecoveryTarget(snapshot())).toEqual({
      origin: "HANDOFF",
      sessionId,
    });
  });

  it.each([
    ["verified", (value: EmployeeHandoffSnapshot) => ({ ...value, phase: "verified" as const })],
    ["wrong location", (value: EmployeeHandoffSnapshot) => ({
      ...value,
      scope: { ...value.scope!, locationId: "99999999-9999-4999-8999-999999999999" },
    })],
    ["wrong task session", (value: EmployeeHandoffSnapshot) => ({
      ...value,
      task: { ...value.task!, sessionId: "88888888-8888-4888-8888-888888888888" },
    })],
    ["non-retrieval task", (value: EmployeeHandoffSnapshot) => ({
      ...value,
      task: { ...value.task!, taskType: "PARKING" as const },
    })],
    ["already verified proof", (value: EmployeeHandoffSnapshot) => ({
      ...value,
      session: {
        ...value.session!,
        handoff: {
          ...value.session!.handoff,
          verification: {
            method: "PICKUP_CODE" as const,
            status: "PENDING" as const,
            verifiedAt: "2026-10-08T19:01:00.000Z",
          },
        },
      },
    })],
  ] as const)("rejects %s context", (_label, mutate) => {
    expect(nativeHandoffGuestAccessRecoveryTarget(mutate(snapshot()))).toBeNull();
  });

  it("keeps the new visible entry point disabled until UI delta approval", () => {
    const open = vi.fn();
    expect(NATIVE_HANDOFF_GUEST_ACCESS_RECOVERY_UI_ENABLED).toBe(false);
    expect(openHandoffGuestAccessRecovery(snapshot(), open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens only Guest Access for the same HANDOFF session when explicitly enabled", () => {
    const open = vi.fn();
    expect(openHandoffGuestAccessRecovery(snapshot(), open, true)).toBe(true);
    expect(open).toHaveBeenCalledWith("guest-access", "HANDOFF", sessionId);
  });
});
