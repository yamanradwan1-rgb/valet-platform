import { describe, expect, it, vi } from "vitest";
import { EmployeeCheckInSession } from "./employee-check-in-session";
import type { EmployeeCheckInTransport } from "./employee-check-in-types";
import { deferred } from "./native-auth-test-fixture";

describe("Employee check-in lifecycle fence", () => {
  it("turns a backgrounded intake into ambiguity and ignores its late result", async () => {
    const result = deferred<{
      color: null;
      createdAt: string;
      customerId: null;
      make: null;
      model: null;
      state: "CHECKING_IN";
      valetSessionId: string;
      vehicleId: string;
      vehicleUpdatedAt: string;
      version: 1;
    }>();
    const transport = {
      completeCheckIn: vi.fn(),
      completeCondition: vi.fn(),
      correctDetails: vi.fn(),
      correctIdentity: vi.fn(),
      createConditionNote: vi.fn(),
      createIntake: vi.fn(() => result.promise),
      loadContinuations: vi.fn(async () => ({ continuations: [] })),
      loadDrafts: vi.fn(async () => ({ drafts: [] })),
      loadSession: vi.fn(),
      recognize: vi.fn(),
    } as EmployeeCheckInTransport;
    const session = new EmployeeCheckInSession({
      createOperationId: () => "11111111-1111-4111-8111-111111111111",
      transport,
    });
    await session.activate(1, "22222222-2222-4222-8222-222222222222");
    session.setVehicle({
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: "Silver SUV",
    });
    session.reviewIdentity();
    await session.confirmIdentity();
    session.continueVehicleDetails();
    const submit = session.submitCustomer();
    session.suspendForBackground();
    result.resolve({
      color: null,
      createdAt: "2026-09-12T00:00:00.000Z",
      customerId: null,
      make: null,
      model: null,
      state: "CHECKING_IN",
      valetSessionId: "33333333-3333-4333-8333-333333333333",
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-09-12T00:00:00.000Z",
      version: 1,
    });
    await submit;
    expect(session.current()).toMatchObject({
      phase: "intake-ambiguous",
      recoveryChecked: false,
    });
    expect(transport.createIntake).toHaveBeenCalledOnce();
  });
});
