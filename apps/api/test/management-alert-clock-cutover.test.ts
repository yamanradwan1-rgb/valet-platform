import { describe, expect, it } from "vitest";
import { parseManagementAlertClockCutover } from "../src/modules/dashboard/management-alert-clock-cutover";

describe("Management Alerts source-clock deployment fence", () => {
  it("requires an explicit, canonical UTC millisecond cutoff", () => {
    const date = parseManagementAlertClockCutover("2026-11-04T02:30:00.123Z");
    expect(date.toISOString()).toBe("2026-11-04T02:30:00.123Z");
  });

  it.each([
    undefined,
    "",
    "2026-11-04T02:30:00Z",
    "2026-11-04T02:30:00.123+00:00",
    "2026-13-04T02:30:00.123Z",
    "2026-11-04",
    "not-a-date",
  ])("fails closed on missing or ambiguous cutover %s", (value) => {
    expect(() => parseManagementAlertClockCutover(value)).toThrow(/cutover/);
  });
});
