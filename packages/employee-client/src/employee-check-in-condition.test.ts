import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "./api-error";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-04T08:00:00.000Z";
const later = "2026-09-04T08:02:00.000Z";

function detail() {
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

async function ready(client: EmployeeCheckInTransport) {
  const session = new EmployeeCheckInSession({
    createOperationId: vi.fn(),
    transport: client,
  });
  await session.activate(5, locationId);
  session.continueVehicleIntake();
  return session;
}

describe("Employee Check-In condition and completion", () => {
  it("records the selected condition note, marker and completion with the authoritative version", async () => {
    const client = transport();
    vi.mocked(client.createConditionNote).mockResolvedValue({
      conditionNoteId: "44444444-4444-4444-8444-444444444444",
      content: "Existing damage",
      createdAt: timestamp,
      supersedesConditionNoteId: null,
      valetSessionId: sessionId,
    });
    vi.mocked(client.completeCondition).mockResolvedValue({
      completedAt: timestamp,
      valetSessionId: sessionId,
    });
    vi.mocked(client.completeCheckIn).mockResolvedValue({
      checkingInCompletedAt: later,
      state: "AWAITING_PARKING",
      valetSessionId: sessionId,
      version: 2,
    });
    const session = await ready(client);
    session.setConditionSelection("Existing damage");
    await session.submitConditionCompletion();
    expect(client.createConditionNote).toHaveBeenCalledWith(sessionId, {
      content: "Existing damage",
    });
    expect(client.completeCondition).toHaveBeenCalledWith(sessionId);
    expect(client.completeCheckIn).toHaveBeenCalledWith(sessionId, {
      expectedVersion: 1,
    });
    expect(session.current()).toMatchObject({
      active: { state: "AWAITING_PARKING", version: 2 },
      continuation: { mode: "condition-completed" },
      error: null,
      phase: "continuation",
    });
  });

  it("defaults to the Web low-friction condition when none is chosen", async () => {
    const client = transport();
    vi.mocked(client.completeCondition).mockResolvedValue({
      completedAt: timestamp,
      valetSessionId: sessionId,
    });
    vi.mocked(client.completeCheckIn).mockResolvedValue({
      checkingInCompletedAt: later,
      state: "AWAITING_PARKING",
      valetSessionId: sessionId,
      version: 2,
    });
    const session = await ready(client);
    await session.submitConditionCompletion();
    expect(client.createConditionNote).toHaveBeenCalledWith(sessionId, {
      content: "No visible issue",
    });
  });

  it("prevents a duplicate submit while the completion is in flight", async () => {
    let resolve!: () => void;
    const client = transport();
    vi.mocked(client.createConditionNote).mockReturnValue(
      new Promise((done) => (resolve = done as () => void)) as never,
    );
    const session = await ready(client);
    const first = session.submitConditionCompletion();
    await session.submitConditionCompletion();
    resolve();
    await first;
    expect(client.createConditionNote).toHaveBeenCalledOnce();
    expect(client.completeCheckIn).not.toHaveBeenCalled();
  });

  it("blocks a photo-required session truthfully instead of fabricating completion", async () => {
    const client = transport();
    vi.mocked(client.completeCondition).mockRejectedValue(
      new EmployeeApiError({
        code: "CHECK_IN_CONDITION_PHOTO_REQUIRED",
        message: "Photo evidence required.",
        status: 409,
      }),
    );
    const session = await ready(client);
    session.setConditionSelection("Existing damage");
    await session.submitConditionCompletion();
    expect(client.completeCheckIn).not.toHaveBeenCalled();
    expect(session.current()).toMatchObject({
      continuation: {
        mode: "select-condition",
        pendingConditionStage: null,
      },
      error: { code: "CHECK_IN_CONDITION_PHOTO_REQUIRED" },
      phase: "created",
    });
    expect(session.current().active?.state).toBe("CHECKING_IN");
  });

  it("selects a condition through the pre-selected low-friction default", async () => {
    const client = transport();
    const session = await ready(client);
    expect(session.current().continuation).toMatchObject({
      conditionSelection: "No visible issue",
      mode: "select-condition",
    });
    session.setConditionSelection("Needs review");
    expect(session.current().continuation.conditionSelection).toBe(
      "Needs review",
    );
  });
});
