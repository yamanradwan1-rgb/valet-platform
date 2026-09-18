import { describe, expect, it } from "vitest";

import { allowsManagementCommercialAccess } from "../src/modules/management/management-commercial-access-policy";

const enabled = {
  basicBrandingEnabled: true,
  dashboardAccessEnabled: true,
  reportExportsEnabled: true,
};

describe("MGT-BE-12 commercial policy", () => {
  it("fails closed when the subscription row is absent", () => {
    expect(allowsManagementCommercialAccess(null, "DASHBOARD_ACCESS")).toBe(false);
    expect(allowsManagementCommercialAccess(null, "REPORT_EXPORTS")).toBe(false);
    expect(allowsManagementCommercialAccess(null, "BASIC_BRANDING")).toBe(false);
  });

  it("requires dashboard access as the base entitlement", () => {
    expect(allowsManagementCommercialAccess(enabled, "DASHBOARD_ACCESS")).toBe(true);
    expect(
      allowsManagementCommercialAccess(
        { ...enabled, dashboardAccessEnabled: false },
        "REPORT_EXPORTS",
      ),
    ).toBe(false);
    expect(
      allowsManagementCommercialAccess(
        { ...enabled, dashboardAccessEnabled: false },
        "BASIC_BRANDING",
      ),
    ).toBe(false);
  });

  it("requires only the typed additional entitlement for each feature", () => {
    expect(
      allowsManagementCommercialAccess(
        { ...enabled, reportExportsEnabled: false },
        "DASHBOARD_ACCESS",
      ),
    ).toBe(true);
    expect(
      allowsManagementCommercialAccess(
        { ...enabled, reportExportsEnabled: false },
        "REPORT_EXPORTS",
      ),
    ).toBe(false);
    expect(
      allowsManagementCommercialAccess(
        { ...enabled, basicBrandingEnabled: false },
        "BASIC_BRANDING",
      ),
    ).toBe(false);
  });

  it("fails closed for an out-of-catalog runtime value", () => {
    expect(
      allowsManagementCommercialAccess(enabled, "CALLER_FEATURE" as never),
    ).toBe(false);
  });
});
