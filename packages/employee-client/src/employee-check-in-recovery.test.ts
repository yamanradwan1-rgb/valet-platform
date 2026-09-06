import { describe, expect, it, vi } from "vitest";

import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-09-04T08:00:00.000Z";

function summary(session = sessionId) {
  return {
    conditionCompletedAt: null,
    createdAt: timestamp,
    sessionId: session,
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
  };
}

function detail(state: "CHECKING_IN" | "AWAITING_PARKING") {
  return {
    checkIn: {
      conditionCompletedAt: state === "CHECKING_IN" ? null : timestamp,
    },
    guestAccess: {
      expiresAt: null,
      revokedAt: null,
      status: "NOT_ISSUED" as const,
    },
    handoff: { pendingAt: null, verification: null },
    keySlot: null,
    locationId,
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: null,
      parkingZoneCode: null,
    },
    sessionId,
    state,
    vehicle: {
      ...summary().vehicle,
      vehicleId: "33333333-3333-4333-8333-333333333333",
      vehicleUpdatedAt: timestamp,
    },
    version: state === "CHECKING_IN" ? 1 : 2,
  };
}

function client(
  drafts = [summary()],
  continuations: ReturnType<typeof summary>[] = [],
  state: "CHECKING_IN" | "AWAITING_PARKING" = "CHECKING_IN",
): EmployeeCheckInTransport {
  return {
    correctDetails: vi.fn(),
    correctIdentity: vi.fn(),
    createIntake: vi.fn(),
    loadContinuations: vi.fn().mockResolvedValue({ continuations }),
    loadDrafts: vi.fn().mockResolvedValue({ drafts }),
    loadSession: vi.fn().mockResolvedValue(detail(state)),
    recognize: vi.fn(),
  };
}

describe("Employee Check-In authoritative recovery", () => {
  it("restores one server draft after process restart", async () => {
    const transport = client();
    const session = new EmployeeCheckInSession({
      createOperationId: vi.fn(),
      transport,
    });
    await session.activate(7, locationId);
    expect(transport.loadSession).toHaveBeenCalledWith(sessionId);
    expect(session.current()).toMatchObject({
      identityGeneration: 7,
      phase: "created",
      active: { sessionId, state: "CHECKING_IN" },
    });
  });

  it("restores one authoritative awaiting-parking continuation", async () => {
    const transport = client([], [summary()], "AWAITING_PARKING");
    const session = new EmployeeCheckInSession({
      createOperationId: vi.fn(),
      transport,
    });
    await session.activate(1, locationId);
    expect(session.current().phase).toBe("continuation");
    expect(session.current().active?.state).toBe("AWAITING_PARKING");
  });

  it("requires employee selection when authoritative recovery is ambiguous", async () => {
    const other = "44444444-4444-4444-8444-444444444444";
    const transport = client([summary(), summary(other)]);
    const session = new EmployeeCheckInSession({
      createOperationId: vi.fn(),
      transport,
    });
    await session.activate(1, locationId);
    expect(session.current().phase).toBe("recoverables");
    expect(session.current().recoverables).toHaveLength(2);
    expect(transport.loadSession).not.toHaveBeenCalled();
  });

  it("purges transient workflow state on identity clear", async () => {
    const session = new EmployeeCheckInSession({
      createOperationId: vi.fn(),
      transport: client([], []),
    });
    await session.activate(1, locationId);
    session.setVehicle({ plateNumberRaw: "SECRET-DRAFT" });
    session.clear();
    expect(session.current()).toMatchObject({
      identityGeneration: null,
      locationId: null,
      phase: "inactive",
      vehicle: { plateNumberRaw: "" },
    });
  });
});
