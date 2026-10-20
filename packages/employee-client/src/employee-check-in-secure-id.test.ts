import { describe, expect, it, vi } from "vitest";
import { EmployeeCheckInSession } from "./employee-check-in-session";

describe("Native Check-In no-insecure-UUID fallback", () => {
  it("fails closed with a visible error and no intake POST if secure identity fails", async () => {
    const createIntake = vi.fn();
    const session = new EmployeeCheckInSession({
      createOperationId: () => { throw Error("PRIVATE_ENTROPY_FAILURE"); },
      transport: {
        createIntake, recognize: vi.fn().mockResolvedValue({ vehicle: null }),
        loadDrafts: vi.fn().mockResolvedValue({ drafts: [] }),
        loadContinuations: vi.fn().mockResolvedValue({ continuations: [] }),
      } as never,
    });
    await session.activate(1, "11111111-1111-4111-8111-111111111111");
    session.setVehicle({ plateNumberRaw: "12-34567", plateCountry: "JO" });
    session.reviewIdentity();
    await session.confirmIdentity();
    session.continueVehicleDetails();
    expect(session.current().phase).toBe("customer");
    await expect(session.submitCustomer()).resolves.toBeUndefined();
    expect(session.current()).toMatchObject({
      phase: "customer", error: { code: "INTAKE_SECURE_ID_UNAVAILABLE" },
    });
    expect(JSON.stringify(session.current())).not.toContain("PRIVATE_ENTROPY_FAILURE");
    expect(createIntake).not.toHaveBeenCalled();
  });
});
