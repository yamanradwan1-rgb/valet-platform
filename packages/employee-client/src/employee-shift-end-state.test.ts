import { describe, expect, it } from "vitest";

import {
  isEmployeeShiftCashValid,
  normalizeEmployeeShiftCash,
  resolveEmployeeShiftEndAuthority,
  validateEmployeeShiftEndResult,
} from "./employee-shift-end-state";
import {
  endedShift,
  shiftEndContext,
  shiftEndIds,
} from "./employee-shift-end-test-fixture";

describe("Employee Shift end state", () => {
  it("maps the exact active Shift authority and bounded summary", () => {
    expect(resolveEmployeeShiftEndAuthority(7, shiftEndContext())).toEqual({
      currency: "JOD",
      identityGeneration: 7,
      locationCode: "AMM-1",
      locationId: shiftEndIds.location,
      locationName: "Amman Hotel",
      membershipId: shiftEndIds.membership,
      organizationId: shiftEndIds.organization,
      organizationName: "VAYLET Operator",
      role: "VALET_EMPLOYEE",
      shiftId: shiftEndIds.shift,
      shiftStartedAt: "2026-09-08T08:00:00.000Z",
    });
  });

  it("does not invent authority from no or ambiguous active Shift context", () => {
    expect(resolveEmployeeShiftEndAuthority(1, { contexts: [] })).toBeNull();
    const active = shiftEndContext().contexts[0]!;
    expect(
      resolveEmployeeShiftEndAuthority(1, {
        contexts: [active, { ...active, membershipId: crypto.randomUUID() }],
      }),
    ).toBeNull();
  });

  it.each([
    [" 1.2 ", "1.2", true],
    ["0", "0", true],
    ["0.000", "0.000", true],
    ["", "", false],
    ["-1", "-1", false],
    ["1.0000", "1.0000", false],
    ["01", "01", false],
  ] as const)("normalizes and validates cash %j", (raw, normalized, valid) => {
    expect(normalizeEmployeeShiftCash(raw)).toBe(normalized);
    expect(isEmployeeShiftCashValid(raw)).toBe(valid);
  });

  it("accepts only a matching canonical terminal response", () => {
    const authority = resolveEmployeeShiftEndAuthority(1, shiftEndContext())!;
    expect(() =>
      validateEmployeeShiftEndResult(authority, "10", endedShift()),
    ).not.toThrow();
  });

  it.each([
    ["shift", { shiftId: crypto.randomUUID() }],
    ["Location", { locationId: crypto.randomUUID() }],
    ["start", { startedAt: "2026-09-08T07:00:00.000Z" }],
    ["terminal status", { status: "ACTIVE" as const, endedAt: null }],
    [
      "reported cash",
      {
        cashReconciliation: {
          ...endedShift().cashReconciliation,
          cashReported: "11.000",
        },
      },
    ],
    [
      "currency",
      {
        cashReconciliation: {
          ...endedShift().cashReconciliation,
          currency: "USD",
        },
      },
    ],
    [
      "cash variance",
      {
        cashReconciliation: {
          ...endedShift().cashReconciliation,
          cashVariance: "2.000",
        },
      },
    ],
    [
      "report time",
      {
        cashReconciliation: {
          ...endedShift().cashReconciliation,
          reportedAt: "2026-09-08T15:59:59.000Z",
        },
      },
    ],
  ] as const)("rejects a mismatched %s result", (_name, overrides) => {
    const authority = resolveEmployeeShiftEndAuthority(1, shiftEndContext())!;
    expect(() =>
      validateEmployeeShiftEndResult(
        authority,
        "10.000",
        endedShift("10.000", overrides),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "SHIFT_END_RESPONSE_MISMATCH" }),
    );
  });
});
