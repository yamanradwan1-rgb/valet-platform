import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { scopeSourceFailureDisposition } from "./scope-entry-policy";

function apiError(kind: DashboardApiError["kind"], status = 0) {
  return new DashboardApiError({ kind, message: kind, status });
}

describe("scopeSourceFailureDisposition", () => {
  it("surfaces Company Admin MFA without applying it to other authorities", () => {
    expect(scopeSourceFailureDisposition("COMPANY_ADMIN", apiError("mfa", 403))).toBe(
      "MFA_REQUIRED",
    );
    expect(scopeSourceFailureDisposition("LOCATION_MANAGER", apiError("mfa", 403))).toBe(
      "ERROR",
    );
  });

  it("treats source authorization denial as an empty authority source", () => {
    expect(scopeSourceFailureDisposition("COMPANY_ADMIN", apiError("authorization", 404))).toBe(
      "EMPTY",
    );
    expect(scopeSourceFailureDisposition("SUPERVISOR", apiError("authorization", 403))).toBe(
      "EMPTY",
    );
  });

  it("keeps transport and entitlement failures visible", () => {
    expect(scopeSourceFailureDisposition("LOCATION_MANAGER", apiError("network"))).toBe("ERROR");
    expect(scopeSourceFailureDisposition("COMPANY_ADMIN", apiError("entitlement", 403))).toBe(
      "ERROR",
    );
  });
});
