import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-04T08:00:00.000Z";
const later = "2026-09-04T08:02:00.000Z";

function detail(
  state: "CHECKING_IN" | "AWAITING_PARKING" = "CHECKING_IN",
  overrides: Record<string, unknown> = {},
) {
  return {
    checkIn: {
      conditionCompletedAt:
        state === "CHECKING_IN"
          ? null
          : (overrides.conditionCompletedAt ?? timestamp),
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
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId,
      vehicleUpdatedAt: timestamp,
    },
    version: (overrides.version as number) ?? (state === "CHECKING_IN" ? 1 : 2),
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

async function ready(transport: EmployeeCheckInTransport) {
  const session = new EmployeeCheckInSession({
    createOperationId: vi.fn(),
    transport,
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

function completionResponse() {
  return {
    checkingInCompletedAt: later,
    state: "AWAITING_PARKING" as const,
    valetSessionId: sessionId,
    version: 2,
  };
}

describe("Employee Check-In condition recovery", () => {
  it("reconciles a lost response after server commit without replaying the note", async () => {
    const client = transport(
      vi
        .fn()
        .mockResolvedValueOnce(detail())
        .mockResolvedValueOnce(detail("AWAITING_PARKING")),
    );
    vi.mocked(client.createConditionNote).mockResolvedValue(noteResponse());
    vi.mocked(client.completeCondition).mockResolvedValue({
      completedAt: timestamp,
      valetSessionId: sessionId,
    });
    vi.mocked(client.completeCheckIn).mockRejectedValue(employeeNetworkError());
    const session = await ready(client);
    session.setConditionSelection("Needs review");
    await session.submitConditionCompletion();
    expect(session.current()).toMatchObject({
      active: { state: "AWAITING_PARKING" },
      continuation: { mode: "condition-completed" },
      error: null,
      phase: "continuation",
    });
    expect(client.createConditionNote).toHaveBeenCalledOnce();
    expect(client.completeCondition).toHaveBeenCalledOnce();
    expect(client.completeCheckIn).toHaveBeenCalledOnce();
  });

  it("keeps an unknown outcome truthful and retries only the canonical read", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(detail())
      .mockRejectedValueOnce(employeeNetworkError());
    const client = transport(load);
    vi.mocked(client.createConditionNote).mockRejectedValue(
      employeeNetworkError(),
    );
    const session = await ready(client);
    session.setConditionSelection("No visible issue");
    await session.submitConditionCompletion();
    expect(session.current().continuation.mode).toBe("ambiguous");
    await session.retryConditionRecovery();
    expect(client.createConditionNote).toHaveBeenCalledOnce();
    expect(client.completeCheckIn).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(3);
    expect(session.current().continuation.mode).toBe("ambiguous");
  });

  it("skips the append-only note on the same-session retry after an ambiguous commit", async () => {
    const client = transport(vi.fn().mockResolvedValue(detail()));
    vi.mocked(client.createConditionNote).mockRejectedValueOnce(
      employeeNetworkError(),
    );
    vi.mocked(client.completeCondition).mockResolvedValue({
      completedAt: timestamp,
      valetSessionId: sessionId,
    });
    vi.mocked(client.completeCheckIn).mockResolvedValue(completionResponse());
    const session = await ready(client);
    session.setConditionSelection("Existing damage");
    await session.submitConditionCompletion();
    expect(session.current().continuation.mode).not.toBe("submitting");
    session.setConditionSelection("Existing damage");
    await session.submitConditionCompletion();
    expect(client.createConditionNote).toHaveBeenCalledOnce();
    expect(client.completeCondition).toHaveBeenCalledOnce();
    expect(client.completeCheckIn).toHaveBeenCalledWith(sessionId, {
      expectedVersion: 1,
    });
    expect(session.current()).toMatchObject({
      active: { state: "AWAITING_PARKING", version: 2 },
      phase: "continuation",
    });
  });

  it("never appends a second note when the user re-confirms the same selection", async () => {
    const client = transport(vi.fn().mockResolvedValue(detail()));
    vi.mocked(client.createConditionNote).mockRejectedValueOnce(
      employeeNetworkError(),
    );
    vi.mocked(client.completeCondition).mockResolvedValue({
      completedAt: timestamp,
      valetSessionId: sessionId,
    });
    vi.mocked(client.completeCheckIn).mockResolvedValue(completionResponse());
    const session = await ready(client);
    session.setConditionSelection("Needs review");
    await session.submitConditionCompletion();
    expect(session.current().continuation.mode).toBe("select-condition");
    session.setConditionSelection("Needs review");
    await session.submitConditionCompletion();
    expect(client.createConditionNote).toHaveBeenCalledOnce();
    expect(client.completeCheckIn).toHaveBeenCalledWith(sessionId, {
      expectedVersion: 1,
    });
  });

  it("refreshes canonical state after a stale version without overwriting it", async () => {
    const client = transport(
      vi.fn().mockResolvedValue(detail("CHECKING_IN", { version: 2 })),
    );
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
    expect(session.current()).toMatchObject({
      active: { state: "CHECKING_IN", version: 2 },
      continuation: { mode: "select-condition" },
      error: { code: "VERSION_CONFLICT" },
    });
  });

  it("ignores a late condition result after identity purge", async () => {
    let resolve!: () => void;
    const client = transport();
    vi.mocked(client.createConditionNote).mockReturnValue(
      new Promise((done) => (resolve = done as () => void)) as never,
    );
    const session = await ready(client);
    const pending = session.submitConditionCompletion();
    session.clear();
    resolve();
    await pending;
    expect(session.current()).toMatchObject({
      active: null,
      identityGeneration: null,
      phase: "inactive",
    });
  });

  it("ignores a late condition result after auth generation and Location change", async () => {
    let resolve!: () => void;
    const client = transport();
    vi.mocked(client.createConditionNote).mockReturnValue(
      new Promise((done) => (resolve = done as () => void)) as never,
    );
    const session = await ready(client);
    const pending = session.submitConditionCompletion();
    const otherLocation = "66666666-6666-4666-8666-666666666666";
    vi.mocked(client.loadDrafts).mockResolvedValue({ drafts: [] });
    await session.activate(6, otherLocation);
    resolve();
    await pending;
    expect(session.current()).toMatchObject({
      identityGeneration: 6,
      locationId: otherLocation,
      phase: "capture",
    });
    expect(session.current().continuation.mode).toBe("view");
  });
});
