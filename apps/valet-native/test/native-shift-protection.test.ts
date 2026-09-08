import type { EmployeeShiftEndSnapshot } from "@valet/employee-client";
import { describe, expect, it } from "vitest";

import {
  nativeShiftEndBackAction,
  shouldRenderDetachedShiftEnd,
} from "../src/shift/native-shift-protection";
import { auth } from "./production-shell-test-fixture";

const snapshot: EmployeeShiftEndSnapshot = {
  authority: {
    currency: "JOD",
    identityGeneration: 1,
    locationCode: "AMM-1",
    locationId: "11111111-1111-4111-8111-111111111111",
    locationName: "Amman Hotel",
    membershipId: "22222222-2222-4222-8222-222222222222",
    organizationId: "33333333-3333-4333-8333-333333333333",
    organizationName: "VAYLET Operator",
    role: "VALET_EMPLOYEE",
    shiftId: "44444444-4444-4444-8444-444444444444",
    shiftStartedAt: "2026-09-08T08:00:00.000Z",
  },
  cashInput: "10.000",
  cashValidationVisible: false,
  failure: null,
  identityGeneration: 1,
  online: true,
  phase: "uncertain",
  result: null,
};

describe("Native Shift end routing protection", () => {
  it("blocks Back only while the command is active and cancels confirmation", () => {
    expect(nativeShiftEndBackAction("submitting")).toBe("block");
    expect(nativeShiftEndBackAction("confirming")).toBe("cancel-confirmation");
    expect(nativeShiftEndBackAction("uncertain")).toBe("allow");
    expect(nativeShiftEndBackAction("ended")).toBe("allow");
  });

  it("keeps uncertain/ended recovery visible after active Shift disappearance", () => {
    expect(shouldRenderDetachedShiftEnd(auth("authenticated"), snapshot)).toBe(
      true,
    );
    expect(
      shouldRenderDetachedShiftEnd(auth("authenticated"), {
        ...snapshot,
        phase: "ended",
      }),
    ).toBe(true);
  });

  it("does not hijack ordinary foreground context loading", () => {
    expect(
      shouldRenderDetachedShiftEnd(
        auth("authenticated"),
        { ...snapshot, phase: "active" },
        "context-loading",
      ),
    ).toBe(false);
    expect(
      shouldRenderDetachedShiftEnd(
        auth("authenticated"),
        snapshot,
        "context-loading",
      ),
    ).toBe(true);
  });

  it("purges detached recovery across logout and auth generation changes", () => {
    expect(
      shouldRenderDetachedShiftEnd(auth("unauthenticated", 2), snapshot),
    ).toBe(false);
    expect(
      shouldRenderDetachedShiftEnd(auth("authenticated", 2), snapshot),
    ).toBe(false);
  });
});
