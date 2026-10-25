import { describe, expect, it } from "vitest";
import { locationLifecycleExplanation } from "./location-lifecycle-explanation";
import type { ManagementLocationLifecycleResponse } from "@valet/contracts";

const location: ManagementLocationLifecycleResponse = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Synthetic location",
  code: "SYN",
  addressText: "Synthetic address",
  timezone: "Asia/Amman",
  currency: "JOD",
  status: "ACTIVE",
  acceptingIntake: false,
  updatedAt: "2026-10-25T00:00:00Z",
  readiness: {
    readyForActivation: true,
    checks: { currencySupported: true, timezoneValid: true },
  },
  drain: {
    blocked: false,
    activeShiftPresent: false,
    nonCompletedValetSessionPresent: false,
    nonTerminalTaskPresent: false,
  },
};
describe("#340 lifecycle explanation", () => {
  it.each([
    "activeShiftPresent",
    "nonCompletedValetSessionPresent",
    "nonTerminalTaskPresent",
  ] as const)("names the real %s blocker in both languages", (key) => {
    const blocked = {
      ...location,
      drain: { ...location.drain, blocked: true, [key]: true },
    };
    expect(locationLifecycleExplanation(blocked, "en")).toMatch(
      /^Deactivation blocked by:/,
    );
    expect(locationLifecycleExplanation(blocked, "ar")).toMatch(
      /^إلغاء التفعيل/,
    );
  });
  it("keeps Intake, Readiness and Drain distinct", () => {
    expect(locationLifecycleExplanation(location, "en")).toBeNull();
    expect(
      locationLifecycleExplanation(
        { ...location, acceptingIntake: true },
        "en",
      ),
    ).toContain("Stop intake");
    expect(
      locationLifecycleExplanation({ ...location, status: "INACTIVE" }, "en"),
    ).toContain("reopens intake");
    expect(
      locationLifecycleExplanation(
        {
          ...location,
          status: "INACTIVE",
          readiness: {
            ...location.readiness,
            readyForActivation: false,
          },
        },
        "en",
      ),
    ).toContain("readiness");
  });
});
