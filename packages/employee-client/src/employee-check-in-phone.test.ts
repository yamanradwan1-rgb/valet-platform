import { describe, expect, it, vi } from "vitest";

import { EmployeeCheckInSession } from "./employee-check-in-session";
import { normalizeJordanCheckInPhone } from "./employee-check-in-state";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";

const locationId = "11111111-1111-4111-8111-111111111111";

async function customerSession() {
  const createIntake = vi.fn().mockResolvedValue({
    color: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    customerId: null,
    make: null,
    model: null,
    state: "CHECKING_IN",
    valetSessionId: "22222222-2222-4222-8222-222222222222",
    vehicleId: "33333333-3333-4333-8333-333333333333",
    vehicleUpdatedAt: "2026-09-14T00:00:00.000Z",
    version: 1,
  });
  const transport = {
    createIntake,
    loadContinuations: vi.fn().mockResolvedValue({ continuations: [] }),
    loadDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
    recognize: vi.fn(),
  } as unknown as EmployeeCheckInTransport;
  const session = new EmployeeCheckInSession({
    createOperationId: () => "intake:phone-test",
    transport,
  });
  await session.activate(1, locationId);
  session.setVehicle({
    mode: "TEMPORARY_DESCRIPTOR",
    temporaryDescriptor: "Silver sedan",
  });
  session.reviewIdentity();
  await session.confirmIdentity();
  session.continueVehicleDetails();
  expect(session.current().phase).toBe("customer");
  return { createIntake, session };
}

describe("Employee Check-In phone state", () => {
  it("never returns malformed non-empty input as a normalized phone", () => {
    expect(normalizeJordanCheckInPhone("77896356")).toEqual({ ok: false });
    expect(normalizeJordanCheckInPhone("79 000 0000")).toEqual({
      ok: true,
      phone: "+962790000000",
    });
  });

  it("does not submit an invalid DIFFERENT_CUSTOMER intent", async () => {
    const { createIntake, session } = await customerSession();
    session.setCustomerPhone("77896356");
    await session.submitCustomer();
    expect(createIntake).not.toHaveBeenCalled();
    expect(session.current().phase).toBe("customer");
  });

  it("submits formatted local input canonically", async () => {
    const { createIntake, session } = await customerSession();
    session.setCustomerPhone("079 000 0000");
    await session.submitCustomer();
    expect(createIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000000" },
      }),
    );
  });

  it("preserves the established empty no-customer intake", async () => {
    const { createIntake, session } = await customerSession();
    session.setCustomerPhone("  ");
    await session.submitCustomer();
    expect(createIntake).toHaveBeenCalledWith(
      expect.not.objectContaining({ customer: expect.anything() }),
    );
  });
});
