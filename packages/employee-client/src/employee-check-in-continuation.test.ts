import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "./api-error";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-04T08:00:00.000Z";
const newer = "2026-09-04T08:01:00.000Z";

function detail(overrides: Record<string, unknown> = {}) {
  return {
    checkIn: { conditionCompletedAt: null },
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
    state: "CHECKING_IN" as const,
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId,
      vehicleUpdatedAt: timestamp,
      ...overrides,
    },
    version: 1,
  };
}

function transport(): EmployeeCheckInTransport {
  return {
    completeCheckIn: vi.fn(),
    completeCondition: vi.fn(),
    correctDetails: vi.fn(),
    correctIdentity: vi.fn(),
    createConditionNote: vi.fn(),
    createIntake: vi.fn(),
    loadContinuations: vi.fn().mockResolvedValue({ continuations: [] }),
    loadDrafts: vi.fn().mockResolvedValue({
      drafts: [
        {
          conditionCompletedAt: null,
          createdAt: timestamp,
          sessionId,
          vehicle: detail().vehicle,
        },
      ],
    }),
    loadSession: vi.fn().mockResolvedValue(detail()),
    recognize: vi.fn(),
  };
}

async function ready(client = transport()) {
  const session = new EmployeeCheckInSession({
    createOperationId: vi.fn(),
    transport: client,
  });
  await session.activate(7, locationId);
  return { client, session };
}

describe("Employee Check-In vehicle continuation", () => {
  it("loads authoritative CHECKING_IN identity and details", async () => {
    const { session } = await ready();
    expect(session.current()).toMatchObject({
      active: {
        sessionId,
        state: "CHECKING_IN",
        vehicle: {
          color: "Black",
          make: "Toyota",
          model: "Camry",
          vehicleUpdatedAt: timestamp,
        },
      },
      continuation: {
        detailsDraft: { color: "Black", make: "Toyota", model: "Camry" },
        mode: "view",
      },
      phase: "created",
    });
  });

  it("corrects details with the exact authoritative version and advances it", async () => {
    const { client, session } = await ready();
    vi.mocked(client.correctDetails).mockResolvedValue({
      color: "Blue",
      make: "Toyota",
      model: "Camry",
      mutationKind: "UPDATED",
      valetSessionId: sessionId,
      vehicleId,
      vehicleUpdatedAt: newer,
    });
    session.editVehicleDetails();
    session.setVehicleDetails({ color: " Blue " });
    await session.submitVehicleDetails();
    expect(client.correctDetails).toHaveBeenCalledWith(sessionId, {
      color: "Blue",
      expectedVehicleUpdatedAt: timestamp,
      make: "Toyota",
      model: "Camry",
    });
    expect(session.current()).toMatchObject({
      active: { vehicle: { color: "Blue", vehicleUpdatedAt: newer } },
      continuation: { lastMutationKind: "DETAILS_UPDATED", mode: "view" },
    });
  });

  it("keeps an authoritative NO_CHANGE response truthful", async () => {
    const { client, session } = await ready();
    vi.mocked(client.correctDetails).mockResolvedValue({
      color: "Black",
      make: "Toyota",
      model: "Camry",
      mutationKind: "NO_CHANGE",
      valetSessionId: sessionId,
      vehicleId,
      vehicleUpdatedAt: timestamp,
    });
    session.editVehicleDetails();
    await session.submitVehicleDetails();
    expect(session.current().continuation.lastMutationKind).toBe(
      "DETAILS_NO_CHANGE",
    );
    expect(session.current().active?.vehicle.vehicleUpdatedAt).toBe(timestamp);
  });

  it("requires explicit confirmation and never recognizes a resumed plate correction", async () => {
    const { client, session } = await ready();
    vi.mocked(client.correctIdentity).mockResolvedValue({
      identityMode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberNormalized: "9988888",
      plateNumberRaw: "99-88888",
      temporaryDescriptor: null,
      valetSessionId: sessionId,
      vehicleId,
      vehicleUpdatedAt: newer,
    });
    session.editVehicleIdentity();
    session.setVehicleIdentity({ plateNumberRaw: "99-88888" });
    await session.submitIdentityCorrection();
    expect(client.correctIdentity).not.toHaveBeenCalled();
    session.reviewVehicleIdentity();
    expect(session.current().continuation.mode).toBe("confirm-identity");
    await session.submitIdentityCorrection();
    expect(client.correctIdentity).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        expectedVehicleUpdatedAt: timestamp,
        identity: expect.objectContaining({ confirmedByHuman: true }),
      }),
    );
    expect(client.recognize).not.toHaveBeenCalled();
    expect(session.current().active?.vehicle.vehicleUpdatedAt).toBe(newer);
  });

  it("converts a temporary descriptor to a human-confirmed plate", async () => {
    const client = transport();
    vi.mocked(client.loadSession).mockResolvedValue(
      detail({
        plateCountry: null,
        plateNumberRaw: null,
        temporaryDescriptor: "Silver SUV",
      }),
    );
    const { session } = await ready(client);
    session.editVehicleIdentity();
    session.setVehicleIdentity({
      mode: "CONFIRMED_PLATE",
      plateCountry: "jo",
      plateNumberRaw: "7-777",
    });
    session.reviewVehicleIdentity();
    expect(session.current().continuation).toMatchObject({
      identityDraft: { plateCountry: "JO", plateNumberRaw: "7-777" },
      mode: "confirm-identity",
    });
  });

  it("corrects a temporary descriptor without plate recognition", async () => {
    const { client, session } = await ready();
    vi.mocked(client.correctIdentity).mockResolvedValue({
      identityMode: "TEMPORARY_DESCRIPTOR",
      plateCountry: null,
      plateNumberNormalized: null,
      plateNumberRaw: null,
      temporaryDescriptor: "Blue SUV at east entrance",
      valetSessionId: sessionId,
      vehicleId,
      vehicleUpdatedAt: newer,
    });
    session.editVehicleIdentity();
    session.setVehicleIdentity({
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: " Blue SUV at east entrance ",
    });
    session.reviewVehicleIdentity();
    await vi.waitFor(() =>
      expect(client.correctIdentity).toHaveBeenCalledOnce(),
    );
    expect(client.correctIdentity).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        expectedVehicleUpdatedAt: timestamp,
        identity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "Blue SUV at east entrance",
        },
      }),
    );
    expect(client.recognize).not.toHaveBeenCalled();
  });

  it.each([
    "VEHICLE_IDENTITY_CONFLICT",
    "VEHICLE_IDENTITY_CUSTODY_CONFLICT",
    "VEHICLE_IDENTITY_SESSION_NOT_MUTABLE",
  ])("surfaces definitive identity error %s", async (code) => {
    const { client, session } = await ready();
    vi.mocked(client.correctIdentity).mockRejectedValue(
      new EmployeeApiError({ code, message: code, status: 409 }),
    );
    session.editVehicleIdentity();
    session.reviewVehicleIdentity();
    await session.submitIdentityCorrection();
    expect(session.current()).toMatchObject({
      continuation: { mode: "confirm-identity", pendingIntent: null },
      error: { code },
    });
  });
});
