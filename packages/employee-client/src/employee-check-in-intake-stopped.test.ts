import { expect, it, vi } from "vitest";
import {
  EmployeeApiError,
  employeeNetworkError,
  normalizeEmployeeApiError,
} from "./api-error";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import { runEmployeeCheckInIntake } from "./employee-check-in-intake";
import { createEmployeeCheckInTransport } from "./employee-check-in-transport";
import type { EmployeeClient } from "./employee-client";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const stopped = () =>
  normalizeEmployeeApiError(409, {
    code: "LOCATION_INTAKE_STOPPED",
    message: "Safe operational denial",
    requestId: "request347",
  });
const input = {
  intakeOperationId: "intake:347",
  targetLocationId: "11111111-1111-4111-8111-111111111111",
  vehicleIdentity: {
    mode: "TEMPORARY_DESCRIPTOR" as const,
    temporaryDescriptor: "Silver Toyota",
  },
};
const success = {
  color: "Silver",
  make: "Toyota",
  model: "Camry",
  customerId: null,
  createdAt: "2026-10-26T00:00:00.000Z",
  vehicleUpdatedAt: "2026-10-26T00:00:00.000Z",
  state: "CHECKING_IN" as const,
  version: 1 as const,
  valetSessionId: "22222222-2222-4222-8222-222222222222",
  vehicleId: "33333333-3333-4333-8333-333333333333",
};

it("preserves the structured transport error as FAILURE with one POST and no false success", async () => {
  const request = vi.fn().mockRejectedValue(stopped());
  const transport = createEmployeeCheckInTransport({
    request,
  } as unknown as EmployeeClient);
  expect(await runEmployeeCheckInIntake(transport, input)).toEqual({
    kind: "FAILURE",
    failure: {
      code: "LOCATION_INTAKE_STOPPED",
      message: "Safe operational denial",
      status: 409,
      retryAfter: undefined,
    },
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith({
    body: input,
    method: "POST",
    path: "/v1/staff/check-in/intakes",
  });
});

it.each(["CONFIRMED_PLATE", "TEMPORARY_DESCRIPTOR", "RETURNING"] as const)(
  "retains %s and phone, stays at customer, never recovers/replays, allows a deliberate new Continue",
  async (mode) => {
    const createIntake = vi
      .fn()
      .mockRejectedValueOnce(stopped())
      .mockResolvedValueOnce(success);
    const recognized = {
      ...success,
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      plateNumberNormalized: "1234567",
      returningCustomer: null,
    };
    const transport: EmployeeCheckInTransport = {
      createIntake,
      completeCheckIn: vi.fn(),
      completeCondition: vi.fn(),
      correctDetails: vi.fn(),
      correctIdentity: vi.fn(),
      createConditionNote: vi.fn(),
      loadSession: vi.fn(),
      loadContinuations: vi.fn().mockResolvedValue({ continuations: [] }),
      loadDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
      recognize: vi
        .fn()
        .mockResolvedValue({
          vehicle: mode === "RETURNING" ? recognized : null,
        }),
    };
    let identity = 0;
    const session = new EmployeeCheckInSession({
      transport,
      createOperationId: () => `intake:${++identity}`,
    });
    await session.activate(7, input.targetLocationId, "authorized-owner");
    session.setVehicle({
      mode: mode === "TEMPORARY_DESCRIPTOR" ? mode : "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "Silver Toyota",
    });
    session.reviewIdentity();
    await session.confirmIdentity();
    if (mode === "RETURNING") session.chooseDifferentCustomer();
    else {
      session.setPreIntakeVehicleDetails({
        make: "Toyota",
        model: "Camry",
        color: "Silver",
      });
      session.continueVehicleDetails();
    }
    session.setCustomerPhone("79 000 0000");
    const before = session.current();
    await session.submitCustomer();
    expect(session.current()).toMatchObject({
      ...before,
      phase: "customer",
      error: { code: "LOCATION_INTAKE_STOPPED", status: 409 },
      active: null,
    });
    await session.recoverAmbiguous();
    await session.retryIntake();
    session.suspendForBackground();
    await session.activate(7, input.targetLocationId, "authorized-owner");
    expect(createIntake).toHaveBeenCalledTimes(1);
    expect(transport.loadSession).not.toHaveBeenCalled();
    expect(transport.loadDrafts).toHaveBeenCalledTimes(1);
    expect(session.current().error?.code).toBe("LOCATION_INTAKE_STOPPED");
    await session.submitCustomer();
    expect(createIntake).toHaveBeenCalledTimes(2);
    expect(session.current().phase).toBe("created");
    // A definite rejection releases the pending request; normal explicit submission allocates a fresh identity.
    expect(
      createIntake.mock.calls.map(([body]) => body.intakeOperationId),
    ).toEqual(["intake:1", "intake:2"]);
    expect(createIntake.mock.calls[1]?.[0].customer).toEqual({
      intent: "DIFFERENT_CUSTOMER",
      phone: "+962790000000",
    });
  },
);

it.each([
  employeeNetworkError(),
  new EmployeeApiError({
    code: "REQUEST_TIMEOUT",
    message: "timeout",
    status: 408,
  }),
  new EmployeeApiError({
    code: "INTERNAL_SERVER_ERROR",
    message: "server",
    status: 500,
  }),
])("retains existing ambiguous handling for $code", async (error) => {
  const transport = {
    createIntake: vi.fn().mockRejectedValue(error),
  } as unknown as EmployeeCheckInTransport;
  expect(await runEmployeeCheckInIntake(transport, input)).toMatchObject({
    kind: "AMBIGUOUS",
    failure: { code: error.code },
  });
  expect(transport.createIntake).toHaveBeenCalledTimes(1);
});
