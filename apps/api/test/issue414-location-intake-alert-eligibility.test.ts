import { describe, expect, it } from "vitest";
import { hasCurrentActiveIntakeStop } from "../src/modules/dashboard/management-alert-sources/location-intake-alert-eligibility";

describe("Issue #414 ALT-16 source-only current intake predicate", () => {
  it("qualifies an active Location only while intake is stopped", () => {
    expect(
      hasCurrentActiveIntakeStop({ status: "ACTIVE", acceptingIntake: false }),
    ).toBe(true);
    expect(
      hasCurrentActiveIntakeStop({ status: "ACTIVE", acceptingIntake: true }),
    ).toBe(false);
  });

  it("does not confuse default inactive or drained/deactivated with a stop", () => {
    expect(
      hasCurrentActiveIntakeStop({
        status: "INACTIVE",
        acceptingIntake: false,
      }),
    ).toBe(false);
    expect(
      hasCurrentActiveIntakeStop({
        status: "INACTIVE",
        acceptingIntake: true,
      }),
    ).toBe(false);
  });

  it("retires and may requalify solely from fresh current source state", () => {
    const cases = [
      { status: "ACTIVE", acceptingIntake: false },
      { status: "ACTIVE", acceptingIntake: true },
      { status: "ACTIVE", acceptingIntake: false },
      { status: "INACTIVE", acceptingIntake: false },
    ] as const;
    expect(cases.map(hasCurrentActiveIntakeStop)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
