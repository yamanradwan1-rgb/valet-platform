import { describe, expect, it, vi } from "vitest";

import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "33333333-3333-4333-8333-333333333333";
const customerId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-09-04T08:00:00.000Z";

describe("returning vehicle pending correction", () => {
  it("waits for intake success before using the existing correction command", async () => {
    const client = {
      completeCheckIn: vi.fn(),
      completeCondition: vi.fn(),
      correctDetails: vi.fn().mockResolvedValue({
        color: "Blue",
        make: "Toyota",
        model: "Corolla",
        mutationKind: "UPDATED",
        valetSessionId: sessionId,
        vehicleId,
        vehicleUpdatedAt: "2026-09-04T08:01:00.000Z",
      }),
      correctIdentity: vi.fn(),
      createConditionNote: vi.fn(),
      createIntake: vi.fn().mockResolvedValue({
        color: null,
        createdAt: timestamp,
        customerId,
        make: null,
        model: null,
        state: "CHECKING_IN",
        valetSessionId: sessionId,
        vehicleId,
        vehicleUpdatedAt: timestamp,
        version: 1,
      }),
      loadContinuations: vi.fn().mockResolvedValue({ continuations: [] }),
      loadDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
      loadSession: vi.fn(),
      recognize: vi.fn().mockResolvedValue({
        vehicle: {
          color: "Black",
          make: "Toyota",
          model: "Camry",
          plateCountry: "JO",
          plateNumberNormalized: "1234567",
          plateNumberRaw: "12-34567",
          returningCustomer: {
            customerId,
            displayName: "A. Customer",
            phoneSuffix: "1234",
          },
          vehicleId,
          vehicleUpdatedAt: timestamp,
        },
      }),
    } satisfies EmployeeCheckInTransport;
    const session = new EmployeeCheckInSession({
      createOperationId: () => "intake:1",
      transport: client,
    });
    await session.activate(1, locationId);
    session.setVehicle({ plateCountry: "JO", plateNumberRaw: "12-34567" });
    session.reviewIdentity();
    await session.confirmIdentity();
    session.setReturningVehicleCorrection({
      color: "Blue",
      make: "Toyota",
      model: "Corolla",
    });
    expect(client.createIntake).not.toHaveBeenCalled();
    expect(client.correctDetails).not.toHaveBeenCalled();
    await session.useSavedCustomer();
    expect(client.createIntake).toHaveBeenCalledOnce();
    expect(client.correctDetails).toHaveBeenCalledWith(sessionId, {
      color: "Blue",
      expectedVehicleUpdatedAt: timestamp,
      make: "Toyota",
      model: "Corolla",
    });
    expect(session.current()).toMatchObject({
      continuation: { mode: "select-condition" },
      phase: "created",
    });
  });
});
