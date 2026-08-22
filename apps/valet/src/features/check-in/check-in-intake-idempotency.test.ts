import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";
import type { IntakeResponse } from "./check-in-api";

const locationId = "22222222-2222-4222-8222-222222222222";
const sessionIdA = "11111111-1111-4111-8111-111111111111";
const sessionIdB = "99999999-9999-4999-8999-999999999999";

const vehicleA = {
  color: "Black",
  make: "Toyota",
  model: "Corolla",
  plateCountry: "JO",
  plateNumberRaw: "11-11111",
  temporaryDescriptor: null,
};

const vehicleB = {
  color: "Silver",
  make: "Honda",
  model: "Civic",
  plateCountry: "JO",
  plateNumberRaw: "22-22222",
  temporaryDescriptor: null,
};

interface RecordedRequest {
  readonly body:
    | {
        customer?: { phone: string };
        intakeOperationId: string;
        targetLocationId: string;
        vehicleIdentity: unknown;
      }
    | undefined;
  readonly method: string;
  readonly path: string;
}

function buildClientMock(): {
  client: EmployeeApiClient;
  intakeBodies(): RecordedRequest[];
  requestMock: ReturnType<typeof vi.fn>;
} {
  const requestMock = vi.fn();
  const client = { request: requestMock } as unknown as EmployeeApiClient;
  const recorded = (): RecordedRequest[] =>
    requestMock.mock.calls
      .map((call) => {
        const path = call[0] as string;
        const init = (call[1] ?? {}) as {
          body?: unknown;
          method?: string;
        };
        return {
          body: init.body as RecordedRequest["body"],
          method: init.method ?? "GET",
          path,
        };
      })
      .filter(
        (entry) =>
          entry.path === "/v1/staff/check-in/intakes" &&
          entry.method === "POST",
      );
  return { client, intakeBodies: recorded, requestMock };
}

function intakeResponse(sessionId: string): IntakeResponse {
  return {
    createdAt: "2026-08-21T18:00:00.000Z",
    customerId: "77777777-7777-4777-8777-777777777777",
    state: "CHECKING_IN",
    valetSessionId: sessionId,
    vehicleId: "44444444-4444-4444-8444-444444444444",
    vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
    version: 1,
  };
}

describe("CheckInController stable intake idempotency", () => {
  let mock: ReturnType<typeof buildClientMock>;

  beforeEach(() => {
    mock = buildClientMock();
    vi.restoreAllMocks();
  });

  it("reuses the same intakeOperationId across a lost-response retry and hydrates the authoritative session on success", async () => {
    mock.requestMock
      .mockRejectedValueOnce(
        new Error("Network connection lost after server commit."),
      )
      .mockResolvedValueOnce(intakeResponse(sessionIdA));

    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(vehicleA);

    await controller.submitCustomerPhone(locationId, "+962791234567");
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("Network connection lost");
    expect(controller.getState().step).toBe("customer-phone");
    expect(controller.getState().pendingVehicle).toEqual(vehicleA);
    expect(mock.intakeBodies()).toHaveLength(1);

    await controller.submitCustomerPhone(locationId, "+962791234567");

    const bodies = mock.intakeBodies();
    expect(bodies).toHaveLength(2);
    const first = bodies[0]!.body!;
    const second = bodies[1]!.body!;
    expect(first.intakeOperationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.intakeOperationId).toBe(first.intakeOperationId);
    expect(second.targetLocationId).toBe(locationId);
    expect(second.customer).toEqual({ phone: "+962791234567" });

    const state = controller.getState();
    expect(state.activeSession?.sessionId).toBe(sessionIdA);
    expect(state.pendingVehicle).toBeNull();
    expect(state.error).toBeNull();
    expect(state.step).toBe("vehicle-condition");
  });

  it("generates a fresh operation id for a genuinely new intake after the previous flow ended", async () => {
    mock.requestMock.mockImplementation(async (path: string) => {
      if (path === "/v1/staff/check-in/drafts") {
        return { drafts: [] };
      }
      if (path === "/v1/staff/check-in/continuations") {
        return { continuations: [] };
      }
      if (path === "/v1/staff/check-in/intakes") {
        return intakeResponse(sessionIdA);
      }
      throw new Error(`Unexpected path ${String(path)}`);
    });

    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(vehicleA);
    await controller.submitCustomerPhone(locationId, "");
    const firstId = mock.intakeBodies()[0]!.body!.intakeOperationId;

    // Authoritative flow ends; employee begins a genuinely new intake.
    await controller.initialize(locationId);
    expect(controller.getState().step).toBe("plate-scan");
    await controller.confirmPlate(vehicleB);
    await controller.submitCustomerPhone(locationId, "");

    const bodies = mock.intakeBodies();
    expect(bodies).toHaveLength(2);
    const secondId = bodies[1]!.body!.intakeOperationId;
    expect(secondId).not.toBe(firstId);
    expect(bodies[1]!.body!.vehicleIdentity).toMatchObject({
      mode: "CONFIRMED_PLATE",
      plateNumberRaw: vehicleB.plateNumberRaw,
    });
  });

  it("does not reuse a stale pending operation id once discovery/hydration replaces the pending flow", async () => {
    const continuation = {
      createdAt: "2026-08-21T17:50:00.000Z",
      sessionId: sessionIdB,
      vehicle: {
        color: null,
        make: "Toyota",
        model: "Corolla",
        plateCountry: "JO",
        plateNumberRaw: vehicleA.plateNumberRaw,
        temporaryDescriptor: null,
      },
    };
    const detail = {
      checkIn: { conditionCompletedAt: "2026-08-21T17:55:00.000Z" },
      keySlot: null,
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId: sessionIdB,
      state: "AWAITING_PARKING",
      vehicle: {
        color: null,
        make: "Toyota",
        model: "Corolla",
        plateCountry: "JO",
        plateNumberRaw: vehicleA.plateNumberRaw,
        temporaryDescriptor: null,
        vehicleId: "44444444-4444-4444-8444-444444444444",
        vehicleUpdatedAt: "2026-08-21T17:50:00.000Z",
      },
      version: 5,
    } as unknown as StaffValetSessionDetailResponse;

    let allowIntakeSuccess = false;
    mock.requestMock.mockImplementation(
      async (path: string, init?: { method?: string }) => {
        const method = init?.method ?? "GET";
        if (path === "/v1/staff/check-in/drafts") return { drafts: [] };
        if (path === "/v1/staff/check-in/continuations") {
          return { continuations: [] };
        }
        if (path === "/v1/staff/check-in/intakes" && method === "POST") {
          if (!allowIntakeSuccess) {
            throw new Error("Network connection lost after server commit.");
          }
          return intakeResponse(sessionIdA);
        }
        if (path === `/v1/staff/valet-sessions/${sessionIdB}`) {
          return detail;
        }
        throw new Error(`Unexpected path ${String(path)}`);
      },
    );

    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(vehicleA);
    await controller.submitCustomerPhone(locationId, "");
    const staleId = mock.intakeBodies()[0]!.body!.intakeOperationId;

    // Discovery proves a server session exists and replaces the pending flow.
    await controller.hydrateFromContinuation(locationId, continuation);
    expect(controller.getState().activeSession?.sessionId).toBe(sessionIdB);
    expect(mock.intakeBodies()).toHaveLength(1);

    // A later genuinely-new intake must not reuse the stale id.
    await controller.initialize(locationId);
    await controller.confirmPlate(vehicleB);
    allowIntakeSuccess = true;
    await controller.submitCustomerPhone(locationId, "");

    expect(mock.intakeBodies()).toHaveLength(2);
    const latestBody = mock.intakeBodies().at(-1)!.body!;
    expect(latestBody.intakeOperationId).not.toBe(staleId);
  });

  it("keeps the synchronous double-submit guard so parallel submissions issue exactly one intake request", async () => {
    let releaseFirst!: (value: IntakeResponse) => void;
    const pending = new Promise<IntakeResponse>((resolve) => {
      releaseFirst = resolve;
    });
    mock.requestMock.mockImplementationOnce(async () => pending);
    mock.requestMock.mockResolvedValue(intakeResponse(sessionIdA));

    const controller = new CheckInController(mock.client, vi.fn());
    await controller.confirmPlate(vehicleA);

    const first = controller.submitCustomerPhone(locationId, "");
    const second = controller.submitCustomerPhone(locationId, "");
    expect(mock.intakeBodies()).toHaveLength(1);
    releaseFirst(intakeResponse(sessionIdA));
    await first;
    await second;

    expect(mock.intakeBodies()).toHaveLength(1);
    expect(controller.getState().activeSession?.sessionId).toBe(sessionIdA);
  });
});
