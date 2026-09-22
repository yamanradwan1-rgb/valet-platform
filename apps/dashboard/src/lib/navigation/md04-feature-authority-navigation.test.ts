import { CircleHelp } from "lucide-react";
import { describe, expect, it } from "vitest";

import { md02NavigationRegistrations } from "../../features/administration/administration-navigation";
import { md03NavigationRegistrations } from "../../features/operations/operations-navigation";
import type { DashboardRouteAccess } from "../scope/dashboard-commercial-access";
import { md01NavigationRegistrations } from "./md01-navigation";
import {
  composeNavigationRegistry,
  resolveNavigation,
} from "./navigation-registry";
import type { DashboardNavigationRegistration } from "./navigation-types";

const md04TestRegistrations = [
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

const registry = composeNavigationRegistry(
  md01NavigationRegistrations,
  md02NavigationRegistrations,
  md03NavigationRegistrations,
  md04TestRegistrations,
);

const foundation = ["workspace", "security", "help"];
const caAdministration = [
  "employees-shifts", "locations", "policies-settings", "roles-permissions",
  "branding", "integrations", "billing-subscription",
];
const lmAdministration = [
  "employees-shifts", "locations", "policies-settings", "branding", "billing-subscription",
];
const operations = ["live-operations", "vehicles", "tasks", "maps-zones", "keys", "incidents"];

const commercial = (basicBranding: boolean) => ({
  basicBranding,
  dashboardAccess: true,
  subscriptionRead: true,
});

function ids(
  role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR",
  locationId: string | null,
  access: DashboardRouteAccess,
) {
  return resolveNavigation(
    registry,
    { role, organizationId: "organization", locationId },
    "en",
    access,
  ).map((item) => item.id);
}

describe("MD-04 full-registry navigation authority", () => {
  it.each([
    [
      "CA Visit Contacts Organization",
      "COMPANY_ADMIN", null,
      {
        commercial: commercial(true), foundationEntryAuthorized: true,
        locationMapsAuthorized: false, visitContactsAuthorized: true,
      },
      [...foundation, ...caAdministration, "test-visit-contacts"],
    ],
    [
      "CA Audit Organization",
      "COMPANY_ADMIN", null,
      {
        commercial: commercial(true), foundationEntryAuthorized: true,
        locationMapsAuthorized: false, managementAuditAuthorized: true,
      },
      [...foundation, ...caAdministration, "test-audit"],
    ],
    [
      "CA Audit exact active Location",
      "COMPANY_ADMIN", "location",
      {
        commercial: commercial(true), foundationEntryAuthorized: true,
        locationMapsAuthorized: true, managementAuditAuthorized: true,
      },
      [...foundation, ...caAdministration, ...operations, "test-audit"],
    ],
    [
      "LM Audit active Location",
      "LOCATION_MANAGER", "location",
      {
        commercial: commercial(true), foundationEntryAuthorized: true,
        locationMapsAuthorized: true, managementAuditAuthorized: true,
      },
      [...foundation, ...lmAdministration, ...operations, "test-audit"],
    ],
    [
      "Supervisor Audit active Shift",
      "SUPERVISOR", "location",
      {
        commercial: { basicBranding: false, dashboardAccess: false, subscriptionRead: false },
        foundationEntryAuthorized: true, locationMapsAuthorized: true,
        managementAuditAuthorized: true,
      },
      [...foundation, "maps-zones", "test-audit"],
    ],
    [
      "LM Visit Contacts grant set",
      "LOCATION_MANAGER", null,
      {
        commercial: { basicBranding: false, dashboardAccess: false, subscriptionRead: false },
        foundationEntryAuthorized: false, locationMapsAuthorized: false,
        visitContactsAuthorized: true,
      },
      ["test-visit-contacts"],
    ],
    [
      "LM Audit inactive Location",
      "LOCATION_MANAGER", "location",
      {
        commercial: { basicBranding: false, dashboardAccess: false, subscriptionRead: false },
        foundationEntryAuthorized: false, locationMapsAuthorized: false,
        managementAuditAuthorized: true,
      },
      ["test-audit"],
    ],
  ] satisfies ReadonlyArray<readonly [
    string,
    "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR",
    string | null,
    DashboardRouteAccess,
    readonly string[],
  ]>)("preserves the real shell registry for %s", (_label, role, locationId, access, expected) => {
    expect(ids(role, locationId, access)).toEqual(expected);
  });

  it("does not turn an MD-04 feature bit into Branding entitlement", () => {
    expect(ids("COMPANY_ADMIN", null, {
      commercial: commercial(false),
      foundationEntryAuthorized: true,
      locationMapsAuthorized: false,
      visitContactsAuthorized: true,
    })).toEqual([
      ...foundation,
      "employees-shifts", "locations", "policies-settings", "roles-permissions",
      "integrations", "billing-subscription", "test-visit-contacts",
    ]);
  });
});
