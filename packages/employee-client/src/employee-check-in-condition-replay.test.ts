import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "./api-error";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-09-04T08:00:00.000Z";

function detail(version = 1) {
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
      vehicleId: "33333333-3333-4333-8333-333333333333",
      vehicleUpdatedAt: timestamp,
    },
    version,
  };
}

function transport(
  loadSession = vi.fn().mockResolvedValue(detail()),
): EmployeeCheckInTransport {
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
    loadSession,
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

function noteResponse() {
  return {
    conditionNoteId: "44444444-4444-4444-8444-444444444444",
    content: "Needs review",
    createdAt: timestamp,
    supersedesConditionNoteId: null,
    valetSessionId: sessionId,
  };
}

describe("Employee Check-In condition note replay fence", () => {
  it("allows note creation to retry after a definitive no-commit failure", async () => {
    const client = transport();
    vi.mocked(client.createConditionNote)
      .mockRejectedValueOnce(
        new EmployeeApiError({
          code: "CHECK_IN_EVIDENCE_REQUEST_INVALID",
          message: "Invalid note.",
          status: 400,
        }),
      )
      .mockResolvedValueOnce(noteResponse());
    vi.mocked(client.completeCondition).mockResolvedValue({
      completedAt: timestamp,
      valetSessionId: sessionId,
    });
    vi.mocked(client.completeCheckIn).mockResolvedValue({
      checkingInCompletedAt: timestamp,
      state: "AWAITING_PARKING",
      valetSessionId: sessionId,
      version: 2,
    });
    const session = await ready(client);
    session.setConditionSelection("Needs review");

    await session.submitConditionCompletion();
    expect(client.createConditionNote).toHaveBeenCalledOnce();
    expect(client.completeCondition).not.toHaveBeenCalled();

    await session.submitConditionCompletion();
    expect(client.createConditionNote).toHaveBeenCalledTimes(2);
    expect(client.completeCondition).toHaveBeenCalledOnce();
    expect(client.completeCheckIn).toHaveBeenCalledOnce();
  });

  it("tracks protected notes independently for different selections", async () => {
    const client = transport();
    vi.mocked(client.createConditionNote).mockResolvedValue(noteResponse());
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
    session.setConditionSelection("Needs review");
    await session.submitConditionCompletion();
    session.setConditionSelection("Existing damage");
    await session.submitConditionCompletion();

    expect(client.createConditionNote).toHaveBeenCalledTimes(2);
    expect(client.createConditionNote).toHaveBeenNthCalledWith(1, sessionId, {
      content: "Existing damage",
    });
    expect(client.createConditionNote).toHaveBeenNthCalledWith(2, sessionId, {
      content: "Needs review",
    });
    expect(client.completeCondition).toHaveBeenCalledTimes(3);
    expect(client.completeCheckIn).not.toHaveBeenCalled();
  });

  it("does not replay a note after a later version conflict", async () => {
    const client = transport(vi.fn().mockResolvedValue(detail(2)));
    vi.mocked(client.createConditionNote).mockResolvedValue(noteResponse());
    vi.mocked(client.completeCondition).mockResolvedValue({
      completedAt: timestamp,
      valetSessionId: sessionId,
    });
    vi.mocked(client.completeCheckIn).mockRejectedValue(
      new EmployeeApiError({
        code: "VERSION_CONFLICT",
        message: "Stale",
        status: 409,
      }),
    );
    const session = await ready(client);
    session.setConditionSelection("No visible issue");

    await session.submitConditionCompletion();
    await session.submitConditionCompletion();

    expect(client.createConditionNote).toHaveBeenCalledOnce();
    expect(client.completeCondition).toHaveBeenCalledTimes(2);
    expect(client.completeCheckIn).toHaveBeenCalledTimes(2);
    expect(client.completeCheckIn).toHaveBeenLastCalledWith(sessionId, {
      expectedVersion: 2,
    });
  });
});
