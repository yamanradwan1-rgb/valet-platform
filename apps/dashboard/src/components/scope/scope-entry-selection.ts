import type { ManagementLocationsResponse, ManagementOrganization } from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  allowsDashboardCommercialRequirement,
  commercialAccessFromSubscription,
  type DashboardRouteAccessRequirement,
} from "../../lib/scope/dashboard-commercial-access";
import {
  listCompanyAdminLocations,
  listLocationManagerLocations,
  readCompanyAdminSubscription,
  resolveCompanyAdminContext,
} from "../../lib/scope/dashboard-scope";
import type {
  ScopeEntryAuthority,
  SelectedDashboardScope,
} from "./scope-entry-types";

export type OrganizationSelectionResult =
  | { readonly kind: "SELECT"; readonly scope: SelectedDashboardScope }
  | { readonly kind: "LOCATIONS"; readonly page: ManagementLocationsResponse }
  | { readonly kind: "UNAVAILABLE" }
  | { readonly kind: "DENIED" };

export async function resolveOrganizationSelection(
  api: DashboardApiClient,
  authority: ScopeEntryAuthority,
  organization: ManagementOrganization,
  accessRequirement: DashboardRouteAccessRequirement,
  signal: AbortSignal,
): Promise<OrganizationSelectionResult> {
  if (authority === "LOCATION_MANAGER") {
    if (accessRequirement === "VISIT_CONTACTS") {
      return {
        kind: "SELECT",
        scope: { authority: "LOCATION_MANAGER_GRANT_SET", organization },
      };
    }
    return {
      kind: "LOCATIONS",
      page: await listLocationManagerLocations(
        api,
        organization.organizationId,
        {},
        signal,
      ),
    };
  }

  if (accessRequirement === "VISIT_CONTACTS") {
    return {
      kind: "SELECT",
      scope: {
        authority: "COMPANY_ADMIN",
        context: await resolveCompanyAdminContext(
          api,
          organization.organizationId,
          { kind: "ALL_LOCATIONS" },
          signal,
        ),
      },
    };
  }
  if (accessRequirement === "MANAGEMENT_AUDIT") {
    return {
      kind: "LOCATIONS",
      page: await listCompanyAdminLocations(
        api,
        organization.organizationId,
        {},
        signal,
      ),
    };
  }

  const subscription = await readCompanyAdminSubscription(
    api,
    organization.organizationId,
    signal,
  );
  if (subscription.organizationId !== organization.organizationId) {
    return { kind: "DENIED" };
  }
  const access = commercialAccessFromSubscription(subscription.subscription);
  if (accessRequirement === "SUBSCRIPTION_READ") {
    return {
      kind: "SELECT",
      scope: { authority: "COMPANY_ADMIN_SUBSCRIPTION", organization },
    };
  }
  const commercialRequirement =
    accessRequirement === "FOUNDATION_ENTRY" ||
    accessRequirement === "LOCATION_MAPS" ||
    accessRequirement === "MANAGEMENT_INTELLIGENCE"
      ? "DASHBOARD"
      : accessRequirement;
  if (!allowsDashboardCommercialRequirement(commercialRequirement, access)) {
    return { kind: "UNAVAILABLE" };
  }
  return {
    kind: "LOCATIONS",
    page: await listCompanyAdminLocations(
      api,
      organization.organizationId,
      {},
      signal,
    ),
  };
}
