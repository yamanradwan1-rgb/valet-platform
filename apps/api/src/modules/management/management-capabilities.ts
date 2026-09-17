import type { ManagementCapability } from "@valet/contracts";

export const companyAdminManagementCapabilities = [
  "COMPANY_DASHBOARD_READ",
  "LOCATION_DASHBOARD_READ",
  "ANALYTICS_READ",
  "REPORTS_READ",
  "REPORT_EXPORT",
  "LIVE_MAP_READ",
  "STAFF_MANAGE_ELIGIBLE",
  "COMPANY_SETTINGS_MANAGE_ELIGIBLE",
  "LOCATION_SETTINGS_MANAGE_ELIGIBLE",
  "BRANDING_MANAGE_ELIGIBLE",
  "LOCATION_LIFECYCLE_MANAGE_ELIGIBLE",
  "TENANT_AUDIT_READ_ELIGIBLE",
  "VISIT_CONTACT_READ_ELIGIBLE",
  "VISIT_CONTACT_CORRECT_ELIGIBLE",
  "ALL_LOCATIONS_SCOPE_SELECT",
] as const satisfies readonly ManagementCapability[];

const capabilitySet = new Set<ManagementCapability>(
  companyAdminManagementCapabilities,
);

export function isCompanyAdminManagementCapability(
  capability: ManagementCapability,
): boolean {
  return capabilitySet.has(capability);
}
