import type { EmployeeHandoffSnapshot } from "@valet/employee-client";

export const handoffRecoverySessionId =
  "44444444-4444-4444-8444-444444444444";
export const handoffRecoveryLocationId =
  "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

export const handoffRecoveryScope = {
  locationCode: "AMM",
  locationId: handoffRecoveryLocationId,
  locationName: "Amman",
  membershipId: memberId,
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE" as const,
  shiftId: "55555555-5555-4555-8555-555555555555",
  shiftStartedAt: "2026-10-08T18:00:00.000Z",
};

export function handoffRecoverySnapshot(): EmployeeHandoffSnapshot {
  return {
    failure: null,
    identityGeneration: 3,
    phase: "pending",
    scope: handoffRecoveryScope,
    session: {
      checkIn: { conditionCompletedAt: "2026-10-08T18:01:00.000Z" },
      guestAccess: { expiresAt: null, revokedAt: null, status: "ACTIVE" },
      handoff: {
        pendingAt: "2026-10-08T19:00:00.000Z",
        verification: null,
      },
      keySlot: { code: "K-9" },
      locationId: handoffRecoveryLocationId,
      parking: {
        parkedAt: "2026-10-08T18:10:00.000Z",
        parkingSpotCode: null,
        parkingStartedAt: "2026-10-08T18:05:00.000Z",
        parkingZoneCode: null,
      },
      sessionId: handoffRecoverySessionId,
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
      sessionId: handoffRecoverySessionId,
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
