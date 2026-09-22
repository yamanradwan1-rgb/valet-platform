import { CircleHelp } from "lucide-react";
import { describe, expect, it } from "vitest";

import { noDashboardCommercialAccess } from "../scope/dashboard-commercial-access";
import { resolveNavigation } from "./navigation-registry";
import type { DashboardNavigationRegistration } from "./navigation-types";

const registrations = [
  {
    accessRequirement: "VISIT_CONTACTS",
    availability: "IMPLEMENTED",
    href: "/test-visit-contacts",
    icon: CircleHelp,
    id: "test-visit-contacts",
    labels: { ar: "جهات الزيارة", en: "Visit Contacts" },
    owner: "MD-04",
    placement: "MAIN",
    roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  },
  {
    accessRequirement: "MANAGEMENT_AUDIT",
    availability: "IMPLEMENTED",
    href: "/test-audit",
    icon: CircleHelp,
    id: "test-audit",
    labels: { ar: "التدقيق", en: "Audit" },
    owner: "MD-04",
    placement: "MAIN",
    roles: ["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"],
    scopeRequirement: "ORGANIZATION",
  },
] satisfies readonly DashboardNavigationRegistration[];

describe("MD-04 Foundation navigation authority", () => {
  it("exposes Visit Contacts from Organization feature authority without commercial access", () => {
    const items = resolveNavigation(
      registrations,
      { role: "LOCATION_MANAGER", organizationId: "org", locationId: null },
      "en",
      {
        commercial: noDashboardCommercialAccess,
        foundationEntryAuthorized: false,
        locationMapsAuthorized: false,
        visitContactsAuthorized: true,
      },
    );
    expect(items.map((item) => item.id)).toEqual(["test-visit-contacts"]);
  });

  it("exposes Audit from CA Organization or exact-Location scopes only with Audit authority", () => {
    const base = {
      commercial: noDashboardCommercialAccess,
      foundationEntryAuthorized: false,
      locationMapsAuthorized: false,
      managementAuditAuthorized: true,
    };
    expect(resolveNavigation(
      registrations,
      { role: "COMPANY_ADMIN", organizationId: "org", locationId: null },
      "en",
      base,
    ).map((item) => item.id)).toEqual(["test-audit"]);
    expect(resolveNavigation(
      registrations,
      { role: "SUPERVISOR", organizationId: "org", locationId: "location" },
      "en",
      base,
    ).map((item) => item.id)).toEqual(["test-audit"]);
    expect(resolveNavigation(
      registrations,
      { role: "COMPANY_ADMIN", organizationId: "org", locationId: null },
      "en",
      { ...base, managementAuditAuthorized: false },
    )).toEqual([]);
  });
});
