import { CircleHelp } from "lucide-react";
import { describe, expect, it } from "vitest";

import { md02NavigationRegistrations } from "../../features/administration/administration-navigation";
import { md03NavigationRegistrations } from "../../features/operations/operations-navigation";
import { md01NavigationRegistrations } from "./md01-navigation";
import {
  noNavigationAuthority,
  type NavigationAuthority,
} from "./navigation-authority";
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

const caFoundation = ["security", "help"];
const nonCaFoundation = ["help"];
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
  access: NavigationAuthority,
) {
  return resolveNavigation(
    registry,
    { role, organizationId: "organization", locationId },
    "en",
    access,
  ).map((item) => item.id);
}

describe("MD-04 navigation filtering", () => {
  it.each([
    [
      "CA Visit Contacts Organization",
      "COMPANY_ADMIN", null,
      {
        ...noNavigationAuthority,
        commercial: commercial(true),
        foundationEntryEligible: true,
        features: { ...noNavigationAuthority.features, VISIT_CONTACTS: "ELIGIBLE" },
      },
      [...caFoundation, ...caAdministration, "test-visit-contacts"],
    ],
    [
      "CA Audit Organization",
      "COMPANY_ADMIN", null,
      {
        ...noNavigationAuthority,
        commercial: commercial(true), foundationEntryEligible: true,
        features: { ...noNavigationAuthority.features, MANAGEMENT_AUDIT: "ELIGIBLE" },
      },
      [...caFoundation, ...caAdministration, "test-audit"],
    ],
    [
      "CA Audit exact active Location",
      "COMPANY_ADMIN", "location",
      {
        ...noNavigationAuthority,
        commercial: commercial(true), foundationEntryEligible: true,
        locationMapsEligible: true,
        features: { ...noNavigationAuthority.features, MANAGEMENT_AUDIT: "ELIGIBLE" },
      },
      [...caFoundation, ...caAdministration, ...operations, "test-audit"],
    ],
    [
      "LM Audit active Location",
      "LOCATION_MANAGER", "location",
      {
        ...noNavigationAuthority,
        commercial: commercial(true), foundationEntryEligible: true,
        locationMapsEligible: true,
        features: { ...noNavigationAuthority.features, MANAGEMENT_AUDIT: "ELIGIBLE" },
      },
      [...nonCaFoundation, ...lmAdministration, ...operations, "test-audit"],
    ],
    [
      "Supervisor Audit active Shift",
      "SUPERVISOR", "location",
      {
        ...noNavigationAuthority,
        commercial: { basicBranding: false, dashboardAccess: false, subscriptionRead: false },
        foundationEntryEligible: true, locationMapsEligible: true,
        features: { ...noNavigationAuthority.features, MANAGEMENT_AUDIT: "ELIGIBLE" },
      },
      [...nonCaFoundation, "maps-zones", "test-audit"],
    ],
    [
      "LM Visit Contacts grant set",
      "LOCATION_MANAGER", null,
      {
        ...noNavigationAuthority,
        commercial: { basicBranding: false, dashboardAccess: false, subscriptionRead: false },
        features: { ...noNavigationAuthority.features, VISIT_CONTACTS: "ELIGIBLE" },
      },
      ["test-visit-contacts"],
    ],
    [
      "LM Audit inactive Location",
      "LOCATION_MANAGER", "location",
      {
        ...noNavigationAuthority,
        commercial: { basicBranding: false, dashboardAccess: false, subscriptionRead: false },
        features: { ...noNavigationAuthority.features, MANAGEMENT_AUDIT: "ELIGIBLE" },
      },
      ["test-audit"],
    ],
  ] satisfies ReadonlyArray<readonly [
    string,
    "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR",
    string | null,
    NavigationAuthority,
    readonly string[],
  ]>)("preserves the real shell registry for %s", (_label, role, locationId, access, expected) => {
    expect(ids(role, locationId, access)).toEqual(expected);
  });

  it("does not turn an MD-04 feature bit into Branding entitlement", () => {
    expect(ids("COMPANY_ADMIN", null, {
      ...noNavigationAuthority,
      commercial: commercial(false),
      foundationEntryEligible: true,
      features: { ...noNavigationAuthority.features, VISIT_CONTACTS: "ELIGIBLE" },
    })).toEqual([
      ...caFoundation,
      "employees-shifts", "locations", "policies-settings", "roles-permissions",
      "integrations", "billing-subscription", "test-visit-contacts",
    ]);
  });
});
