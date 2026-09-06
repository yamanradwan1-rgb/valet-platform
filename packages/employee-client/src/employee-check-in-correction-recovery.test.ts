import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-04T08:00:00.000Z";
const newer = "2026-09-04T08:01:00.000Z";

function detail(color = "Black", updatedAt = timestamp, id = sessionId) {
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
    sessionId: id,
    state: "CHECKING_IN" as const,
    vehicle: {
      color,
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId:
        id === sessionId ? vehicleId : "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: updatedAt,
    },
    version: 1,
  };
}

function client(
  loadSession = vi.fn().mockResolvedValue(detail()),
): EmployeeCheckInTransport {
  return {
    correctDetails: vi.fn(),
    correctIdentity: vi.fn(),
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
    loadSession,
    recognize: vi.fn(),
  };
}

async function ready(transport: EmployeeCheckInTransport) {
  const session = new EmployeeCheckInSession({
    createOperationId: vi.fn(),
    transport,
  });
  await session.activate(1, locationId);
  session.editVehicleDetails();
  session.setVehicleDetails({ color: "Blue" });
  return session;
}

describe("Employee Check-In correction recovery", () => {
  it("refreshes canonical state after a stale version without overwriting", async () => {
    const transport = client(
      vi
        .fn()
        .mockResolvedValueOnce(detail())
        .mockResolvedValueOnce(detail("Red", newer)),
    );
    vi.mocked(transport.correctDetails).mockRejectedValue(
      new EmployeeApiError({
        code: "VEHICLE_DETAILS_VERSION_CONFLICT",
        message: "Changed",
        status: 409,
      }),
    );
    const session = await ready(transport);
    await session.submitVehicleDetails();
    expect(transport.correctDetails).toHaveBeenCalledOnce();
    expect(session.current()).toMatchObject({
      active: { vehicle: { color: "Red", vehicleUpdatedAt: newer } },
      continuation: { mode: "conflict", pendingIntent: null },
      error: { code: "VEHICLE_DETAILS_VERSION_CONFLICT" },
    });
  });

  it("reconciles an unknown response only when canonical state proves the intent", async () => {
    const transport = client(
      vi
        .fn()
        .mockResolvedValueOnce(detail())
        .mockResolvedValueOnce(detail("Blue", newer)),
    );
    vi.mocked(transport.correctDetails).mockRejectedValue(
      employeeNetworkError(),
    );
    const session = await ready(transport);
    await session.submitVehicleDetails();
    expect(transport.correctDetails).toHaveBeenCalledOnce();
    expect(session.current()).toMatchObject({
      active: { vehicle: { color: "Blue", vehicleUpdatedAt: newer } },
      continuation: { lastMutationKind: "RECONCILED", mode: "view" },
      error: null,
    });
  });

  it("adopts a different canonical result as conflict without replay", async () => {
    const transport = client(
      vi
        .fn()
        .mockResolvedValueOnce(detail())
        .mockResolvedValueOnce(detail("Red", newer)),
    );
    vi.mocked(transport.correctDetails).mockRejectedValue(
      employeeNetworkError(),
    );
    const session = await ready(transport);
    await session.submitVehicleDetails();
    expect(transport.correctDetails).toHaveBeenCalledOnce();
    expect(session.current()).toMatchObject({
      active: { vehicle: { color: "Red" } },
      continuation: { mode: "conflict", pendingIntent: null },
    });
  });

  it("retains only in-memory intent while reread is ambiguous and retries only the read", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(detail())
      .mockRejectedValueOnce(employeeNetworkError())
      .mockResolvedValueOnce(detail("Blue", newer));
    const transport = client(load);
    vi.mocked(transport.correctDetails).mockRejectedValue(
      employeeNetworkError(),
    );
    const session = await ready(transport);
    await session.submitVehicleDetails();
    expect(session.current().continuation).toMatchObject({
      mode: "ambiguous",
      pendingIntent: { kind: "DETAILS" },
    });
    await session.retryCorrectionRecovery();
    expect(transport.correctDetails).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(3);
    expect(session.current().continuation.lastMutationKind).toBe("RECONCILED");
  });

  it("ignores a late result after auth purge", async () => {
    let resolve!: (
      value: Awaited<ReturnType<EmployeeCheckInTransport["correctDetails"]>>,
    ) => void;
    const transport = client();
    vi.mocked(transport.correctDetails).mockReturnValue(
      new Promise((done) => (resolve = done)),
    );
    const session = await ready(transport);
    const pending = session.submitVehicleDetails();
    session.clear();
    resolve({
      color: "Blue",
      make: "Toyota",
      model: "Camry",
      mutationKind: "UPDATED",
      valetSessionId: sessionId,
      vehicleId,
      vehicleUpdatedAt: newer,
    });
    await pending;
    expect(session.current()).toMatchObject({
      active: null,
      continuation: { pendingIntent: null },
      identityGeneration: null,
      phase: "inactive",
    });
  });

  it("ignores a late result after auth generation and Location change", async () => {
    let resolve!: (
      value: Awaited<ReturnType<EmployeeCheckInTransport["correctDetails"]>>,
    ) => void;
    const transport = client();
    vi.mocked(transport.correctDetails).mockReturnValue(
      new Promise((done) => (resolve = done)),
    );
    const session = await ready(transport);
    const pending = session.submitVehicleDetails();
    const otherLocation = "66666666-6666-4666-8666-666666666666";
    vi.mocked(transport.loadDrafts).mockResolvedValue({ drafts: [] });
    await session.activate(2, otherLocation);
    resolve({
      color: "Blue",
      make: "Toyota",
      model: "Camry",
      mutationKind: "UPDATED",
      valetSessionId: sessionId,
      vehicleId,
      vehicleUpdatedAt: newer,
    });
    await pending;
    expect(session.current()).toMatchObject({
      active: null,
      identityGeneration: 2,
      locationId: otherLocation,
      phase: "capture",
    });
  });

  it("does not mix drafts or versions when switching sessions", async () => {
    const secondId = "55555555-5555-4555-8555-555555555555";
    let resolve!: (
      value: Awaited<ReturnType<EmployeeCheckInTransport["correctDetails"]>>,
    ) => void;
    const transport = client();
    vi.mocked(transport.correctDetails).mockReturnValue(
      new Promise((done) => (resolve = done)),
    );
    vi.mocked(transport.loadDrafts).mockResolvedValue({
      drafts: [
        {
          conditionCompletedAt: null,
          createdAt: timestamp,
          sessionId,
          vehicle: detail().vehicle,
        },
        {
          conditionCompletedAt: null,
          createdAt: timestamp,
          sessionId: secondId,
          vehicle: detail("Green", newer, secondId).vehicle,
        },
      ],
    });
    vi.mocked(transport.loadSession).mockImplementation(async (id) =>
      id === sessionId ? detail() : detail("Green", newer, secondId),
    );
    const session = new EmployeeCheckInSession({
      createOperationId: vi.fn(),
      transport,
    });
    await session.activate(9, locationId);
    const [first, second] = session.current().recoverables;
    await session.resume(first!);
    session.editVehicleDetails();
    session.setVehicleDetails({ color: "PRIVATE-DRAFT" });
    const pending = session.submitVehicleDetails();
    await session.resume(second!);
    resolve({
      color: "PRIVATE-DRAFT",
      make: "Toyota",
      model: "Camry",
      mutationKind: "UPDATED",
      valetSessionId: sessionId,
      vehicleId,
      vehicleUpdatedAt: newer,
    });
    await pending;
    expect(session.current()).toMatchObject({
      active: {
        sessionId: secondId,
        vehicle: { color: "Green", vehicleUpdatedAt: newer },
      },
      continuation: {
        detailsDraft: { color: "Green" },
        mode: "view",
        pendingIntent: null,
      },
    });
  });
});
