import {
  EmployeeShiftEndSession,
  EmployeeShiftStartSession,
  employeeNetworkError,
  type StaffOperationalContextResponse,
} from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

import { retireNativeShiftScope } from "../src/shift/native-shift-retirement";

const generation = 7;
const ids = {
  location: "11111111-1111-4111-8111-111111111111",
  membership: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  oldShift: "44444444-4444-4444-8444-444444444444",
  newShift: "55555555-5555-4555-8555-555555555555",
};
const startedAt = "2026-09-08T08:00:00.000Z";
const endedAt = "2026-09-08T16:00:00.000Z";
const location = {
  code: "AMM-1",
  currency: "JOD",
  locationId: ids.location,
  name: "Amman Hotel",
};

function context(active: boolean): StaffOperationalContextResponse {
  return {
    contexts: [
      {
        activeShift: active
          ? {
              locationId: ids.location,
              shiftId: ids.oldShift,
              startedAt,
              status: "ACTIVE",
            }
          : null,
        currentLocation: active ? location : null,
        eligibleLocations: [location],
        membershipId: ids.membership,
        organization: {
          name: "VAYLET Operator",
          organizationId: ids.organization,
        },
        role: "VALET_EMPLOYEE",
      },
    ],
  };
}

function ended() {
  return {
    cashReconciliation: {
      cashExpected: "0.000",
      cashReported: "0.000",
      cashVariance: "0.000",
      currency: "JOD",
      reportedAt: endedAt,
    },
    endedAt,
    locationId: ids.location,
    shiftId: ids.oldShift,
    startedAt,
    status: "ENDED" as const,
  };
}

function clearable() {
  return { clear: vi.fn() };
}

function targets(
  shiftStart: EmployeeShiftStartSession,
  operations: { clear(): void },
) {
  return {
    checkIn: clearable(),
    confirmParking: clearable(),
    handoff: clearable(),
    operations,
    parking: clearable(),
    release: clearable(),
    retrieval: clearable(),
    shiftStart,
  };
}

describe("Native post-End Shift retirement", () => {
  it("re-enters Start Shift from fresh authority in the same auth generation", async () => {
    const startCommand = vi.fn(async (targetLocationId: string) => ({
      endedAt: null,
      locationId: targetLocationId,
      shiftId: ids.newShift,
      startedAt: endedAt,
      status: "ACTIVE" as const,
    }));
    const shiftStart = new EmployeeShiftStartSession({
      refreshOperationalContext: vi.fn(async () => undefined),
      transport: { startShift: startCommand },
    });
    shiftStart.activate(generation);
    shiftStart.observeOperationalContext(generation, context(true));
    expect(shiftStart.current().phase).toBe("active");

    const operations = {
      activate: vi.fn(async (identityGeneration: number) => {
        shiftStart.observeOperationalContext(
          identityGeneration,
          context(false),
        );
      }),
      clear: vi.fn(),
    };
    const retirement = targets(shiftStart, operations);
    const shiftEnd = new EmployeeShiftEndSession({
      onEnded: () => retireNativeShiftScope(retirement, generation),
      transport: { endShift: vi.fn(async () => ended()) },
    });
    shiftEnd.activate(generation);
    shiftEnd.observeOperationalContext(generation, context(true));
    shiftEnd.setCashInput("0");
    shiftEnd.requestConfirmation();
    await shiftEnd.endShift();

    expect(shiftEnd.current()).toMatchObject({
      phase: "ended",
      result: ended(),
    });
    for (const workflow of [
      retirement.checkIn,
      retirement.confirmParking,
      retirement.handoff,
      retirement.operations,
      retirement.parking,
      retirement.release,
      retirement.retrieval,
    ]) {
      expect(workflow.clear).toHaveBeenCalledOnce();
    }
    expect(shiftStart.current()).toMatchObject({
      identityGeneration: generation,
      phase: "inactive",
      startableLocations: [],
    });
    expect(startCommand).not.toHaveBeenCalled();

    shiftEnd.finish();
    await operations.activate(generation);
    expect(shiftStart.current()).toMatchObject({
      identityGeneration: generation,
      phase: "ready",
      selectedLocationId: ids.location,
      startableLocations: [location],
    });
    expect(startCommand).not.toHaveBeenCalled();

    await shiftStart.start();
    expect(startCommand).toHaveBeenCalledExactlyOnceWith(ids.location);
  });

  it("purges an uncertain old Start attempt and retains generation fencing", async () => {
    const startCommand = vi.fn(async () => {
      throw employeeNetworkError();
    });
    const shiftStart = new EmployeeShiftStartSession({
      refreshOperationalContext: vi.fn(async () => undefined),
      transport: { startShift: startCommand },
    });
    shiftStart.activate(generation);
    shiftStart.observeOperationalContext(generation, context(false));
    await shiftStart.start();
    expect(shiftStart.current().phase).toBe("uncertain");

    retireNativeShiftScope(targets(shiftStart, clearable()), generation);
    expect(shiftStart.current()).toMatchObject({
      identityGeneration: generation,
      phase: "inactive",
      startableLocations: [],
    });
    await shiftStart.retry();
    expect(startCommand).toHaveBeenCalledOnce();

    shiftStart.activate(generation + 1);
    shiftStart.observeOperationalContext(generation, context(false));
    expect(shiftStart.current()).toMatchObject({
      identityGeneration: generation + 1,
      phase: "inactive",
      startableLocations: [],
    });
  });
});
