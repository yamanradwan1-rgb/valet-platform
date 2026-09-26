import { describe, expect, it } from "vitest";

import { formatStaffTime, selectedStaffLocation } from "./staff-presentation";

const location = {
  locationId: "33333333-3333-4333-8333-333333333333",
  name: "Main Garage",
  code: "MAIN",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};

describe("R05 staff presentation", () => {
  it("formats Shift timestamps in the authoritative Location timezone", () => {
    expect(formatStaffTime("2026-09-21T07:00:00.000Z", "Asia/Amman", "en"))
      .toContain("10:00");
    expect(formatStaffTime("2026-09-21T07:00:00.000Z", "Asia/Amman", "ar"))
      .not.toBe("2026-09-21T07:00:00.000Z");
  });

  it("uses a truthful fallback for invalid timestamps or timezones", () => {
    expect(formatStaffTime("invalid", "Asia/Amman", "en")).toBe("—");
    expect(formatStaffTime("2026-09-21T07:00:00.000Z", "Invalid/Zone", "en")).toBe("—");
  });

  it("extracts only the selected authorized exact Location", () => {
    expect(selectedStaffLocation({
      authority: "LOCATION_MANAGER",
      organization: { organizationId: "11111111-1111-4111-8111-111111111111", name: "Acme", timezone: "Asia/Amman" },
      location,
    })).toEqual(location);
    expect(selectedStaffLocation({
      authority: "COMPANY_ADMIN_SUBSCRIPTION",
      organization: { organizationId: "11111111-1111-4111-8111-111111111111", name: "Acme", timezone: "Asia/Amman" },
    })).toBeNull();
  });
});
