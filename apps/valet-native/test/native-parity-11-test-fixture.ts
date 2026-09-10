import type { StaffValetSessionDetailResponse } from "@valet/employee-client";
import type { NativeGuestAccessSnapshot } from "../src/guest-access/native-guest-access-types";
import type { NativeIncidentSnapshot } from "../src/incident/native-incident-types";

export const sessionId = "44444444-4444-4444-8444-444444444444";

export function detail(
  status: StaffValetSessionDetailResponse["guestAccess"]["status"] = "NOT_ISSUED",
): StaffValetSessionDetailResponse {
  return {
    checkIn: { conditionCompletedAt: "2026-09-07T07:59:00.000Z" },
    guestAccess: {
      expiresAt: status === "NOT_ISSUED" ? null : "2026-09-11T10:00:00.000Z",
      revokedAt: status === "REVOKED" ? "2026-09-10T10:00:00.000Z" : null,
      status,
    },
    handoff: { pendingAt: null, verification: null },
    keySlot: { code: "K-9" },
    locationId: "11111111-1111-4111-8111-111111111111",
    parking: {
      parkedAt: "2026-09-07T08:10:00.000Z",
      parkingSpotCode: "LC-7",
      parkingStartedAt: "2026-09-07T08:00:00.000Z",
      parkingZoneCode: "ZONE-LC",
    },
    sessionId,
    state: "PARKED",
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId: "77777777-7777-4777-8777-777777777777",
      vehicleUpdatedAt: "2026-09-07T07:55:00.000Z",
    },
    version: 5,
  };
}

const target = { origin: "PARKING" as const, sessionId };

export function incidentSnapshot(
  phase: NativeIncidentSnapshot["phase"],
  patch: Partial<NativeIncidentSnapshot> = {},
): NativeIncidentSnapshot {
  return {
    detail: ["form", "submitting", "success"].includes(phase) ? detail() : null,
    error: null,
    phase,
    report:
      phase === "success"
        ? {
            createdAt: "2026-09-10T10:00:00.000Z",
            incidentId: "88888888-8888-4888-8888-888888888888",
            reportedByMembershipId: "22222222-2222-4222-8222-222222222222",
            sessionId,
            severity: "LOW",
            status: "OPEN",
            type: "VEHICLE_DAMAGE",
          }
        : null,
    target: phase === "inactive" ? null : target,
    ...patch,
  };
}

export function guestSnapshot(
  phase: NativeGuestAccessSnapshot["phase"],
  status: NativeGuestAccessSnapshot["status"] = null,
  patch: Partial<NativeGuestAccessSnapshot> = {},
): NativeGuestAccessSnapshot {
  const access = status === null ? null : detail(status).guestAccess;
  return {
    credentialFresh: false,
    error: phase === "load-error" ? "LOAD_FAILED" : null,
    expiresAt: access?.expiresAt ?? null,
    mutation: null,
    phase,
    revokedAt: access?.revokedAt ?? null,
    status,
    target: phase === "inactive" ? null : target,
    ...patch,
  };
}
