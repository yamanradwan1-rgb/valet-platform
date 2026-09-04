import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const vehicleId = "33333333-3333-4333-8333-333333333333";
const customerId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-09-04T08:00:00.000Z";

function intake() {
  return {
    color: null,
    createdAt: timestamp,
    customerId: null,
    make: null,
    model: null,
    state: "CHECKING_IN" as const,
    valetSessionId: sessionId,
    vehicleId,
    vehicleUpdatedAt: timestamp,
    version: 1 as const,
  };
}

function transport(
  createIntake: EmployeeCheckInTransport["createIntake"] = vi
    .fn()
    .mockResolvedValue(intake()),
): EmployeeCheckInTransport {
  return {
    createIntake,
    loadContinuations: vi.fn().mockResolvedValue({ continuations: [] }),
    loadDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
    loadSession: vi.fn(),
    recognize: vi.fn().mockResolvedValue({ vehicle: null }),
  };
}

async function ready(client: EmployeeCheckInTransport) {
  let operation = 0;
  const session = new EmployeeCheckInSession({
    createOperationId: () => `intake:${++operation}`,
    transport: client,
  });
  await session.activate(1, locationId);
  return session;
}

function plate(session: EmployeeCheckInSession) {
  session.setVehicle({ plateCountry: "jo", plateNumberRaw: "12-34567" });
  session.reviewIdentity();
}

describe("EmployeeCheckInSession", () => {
  it("recognizes only after explicit plate confirmation and offers saved Customer intent", async () => {
    const client = transport();
    vi.mocked(client.recognize).mockResolvedValue({
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
    });
    const session = await ready(client);
    plate(session);
    expect(client.recognize).not.toHaveBeenCalled();
    expect(session.current().phase).toBe("confirm");
    await session.confirmIdentity();
    expect(session.current().phase).toBe("returning");
    await session.useSavedCustomer();
    expect(client.createIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { customerId, intent: "USE_SAVED_CUSTOMER" },
        vehicleIdentity: expect.objectContaining({
          confirmedByHuman: true,
          mode: "CONFIRMED_PLATE",
        }),
      }),
    );
    expect(session.current().phase).toBe("created");
  });

  it("handles an unknown exact plate through explicit different-Customer phone input", async () => {
    const client = transport();
    const session = await ready(client);
    plate(session);
    await session.confirmIdentity();
    expect(session.current().phase).toBe("customer");
    session.setCustomerPhone("079 000 0000");
    await session.submitCustomer();
    expect(client.createIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000000" },
      }),
    );
  });

  it("requires a descriptor and never recognizes the no-plate path", async () => {
    const client = transport();
    const session = await ready(client);
    session.setVehicle({
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: "",
    });
    session.reviewIdentity();
    expect(session.current().error?.code).toBe("TEMPORARY_DESCRIPTOR_REQUIRED");
    session.setVehicle({ temporaryDescriptor: "Silver Toyota SUV" });
    session.reviewIdentity();
    await session.confirmIdentity();
    expect(client.recognize).not.toHaveBeenCalled();
    await session.submitCustomer();
    expect(client.createIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleIdentity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: "Silver Toyota SUV",
        },
      }),
    );
  });

  it("rehydrates before an explicit exact retry and keeps one operation identity", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(employeeNetworkError())
      .mockResolvedValueOnce(intake());
    const client = transport(create);
    const session = await ready(client);
    plate(session);
    await session.confirmIdentity();
    await session.submitCustomer();
    expect(session.current().phase).toBe("intake-ambiguous");
    await session.retryIntake();
    expect(create).toHaveBeenCalledTimes(1);
    await session.recoverAmbiguous();
    expect(session.current().recoveryChecked).toBe(true);
    await session.retryIntake();
    expect(session.current().phase).toBe("created");
    expect(create.mock.calls[0]?.[0].intakeOperationId).toBe(
      create.mock.calls[1]?.[0].intakeOperationId,
    );
  });

  it("drops a stale saved-Customer suggestion and requires current input", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        new EmployeeApiError({
          code: "RETURNING_CUSTOMER_INTENT_INVALID",
          message: "Suggestion changed.",
          status: 409,
        }),
      )
      .mockResolvedValueOnce(intake());
    const client = transport(create);
    vi.mocked(client.recognize).mockResolvedValue({
      vehicle: {
        color: null,
        make: null,
        model: null,
        plateCountry: "JO",
        plateNumberNormalized: "1234567",
        plateNumberRaw: "12-34567",
        returningCustomer: {
          customerId,
          displayName: null,
          phoneSuffix: "1234",
        },
        vehicleId,
        vehicleUpdatedAt: timestamp,
      },
    });
    const session = await ready(client);
    plate(session);
    await session.confirmIdentity();
    await session.useSavedCustomer();
    expect(session.current().phase).toBe("customer");
    expect(session.current().recognizedVehicle?.returningCustomer).toBeNull();
    session.setCustomerPhone("079 000 0000");
    await session.submitCustomer();
    expect(create.mock.calls[0]?.[0].intakeOperationId).not.toBe(
      create.mock.calls[1]?.[0].intakeOperationId,
    );
  });
});
