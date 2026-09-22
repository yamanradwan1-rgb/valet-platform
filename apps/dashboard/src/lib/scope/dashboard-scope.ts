import {
  dashboardFeatureAuthorityQuerySchema,
  dashboardFeatureAuthorityResponseSchema,
  locationSubscriptionResponseSchema,
  managementContextResponseSchema,
  managementListQuerySchema,
  managementLocationsResponseSchema,
  managementOrganizationsResponseSchema,
  managementSubscriptionResponseSchema,
  staffOperationalContextResponseSchema,
  type LocationSubscriptionResponse,
  type DashboardFeatureAuthorityQuery,
  type DashboardFeatureAuthorityResponse,
  type ManagementContextResponse,
  type ManagementListQuery,
  type ManagementLocation,
  type ManagementLocationsResponse,
  type ManagementOrganization,
  type ManagementOrganizationsResponse,
  type ManagementScope,
  type ManagementSubscriptionResponse,
  type StaffOperationalLocation,
  type StaffOperationalMembershipContext,
  type StaffOperationalOrganization,
  type StaffOperationalShift,
} from "@valet/contracts";

import type { DashboardApiClient } from "../api/dashboard-api-client";

export interface CompanyAdminCandidate {
  readonly authority: "COMPANY_ADMIN";
  readonly organization: ManagementOrganization;
}

export interface LocationManagerCandidate {
  readonly authority: "LOCATION_MANAGER";
  readonly organization: ManagementOrganization;
  readonly location: ManagementLocation;
}

export interface SupervisorCandidate {
  readonly authority: "SUPERVISOR";
  readonly membershipId: string;
  readonly organization: StaffOperationalOrganization;
  readonly location: StaffOperationalLocation;
  readonly activeShift: StaffOperationalShift;
}

export type DashboardScopeCandidate =
  | CompanyAdminCandidate
  | LocationManagerCandidate
  | SupervisorCandidate;

export interface SelectorPageInput {
  readonly cursor?: string;
  readonly limit?: number;
}

export function boundedSelectorPage(input: SelectorPageInput = {}): ManagementListQuery {
  return managementListQuerySchema.parse({
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
}

export async function listCompanyAdminOrganizations(
  api: DashboardApiClient,
  page: SelectorPageInput = {},
  signal?: AbortSignal,
): Promise<ManagementOrganizationsResponse> {
  const query = boundedSelectorPage(page);
  return api.request(
    "/v1/staff/management/organizations",
    managementOrganizationsResponseSchema,
    { method: "GET", query, signal },
  );
}

export async function listCompanyAdminLocations(
  api: DashboardApiClient,
  organizationId: string,
  page: SelectorPageInput = {},
  signal?: AbortSignal,
): Promise<ManagementLocationsResponse> {
  const query = boundedSelectorPage(page);
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/locations`,
    managementLocationsResponseSchema,
    { method: "GET", query, signal },
  );
}

export async function resolveCompanyAdminContext(
  api: DashboardApiClient,
  organizationId: string,
  scope: ManagementScope,
  signal?: AbortSignal,
): Promise<ManagementContextResponse> {
  const query =
    scope.kind === "LOCATION"
      ? { scopeKind: "LOCATION", locationId: scope.locationId }
      : { scopeKind: "ALL_LOCATIONS" };
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/context`,
    managementContextResponseSchema,
    { method: "GET", query, signal },
  );
}

export function readCompanyAdminSubscription(
  api: DashboardApiClient,
  organizationId: string,
  signal?: AbortSignal,
): Promise<ManagementSubscriptionResponse> {
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/subscription`,
    managementSubscriptionResponseSchema,
    { method: "GET", signal },
  );
}

export async function listLocationManagerOrganizations(
  api: DashboardApiClient,
  page: SelectorPageInput = {},
  signal?: AbortSignal,
): Promise<ManagementOrganizationsResponse> {
  const query = boundedSelectorPage(page);
  return api.request(
    "/v1/staff/dashboard/organizations",
    managementOrganizationsResponseSchema,
    { method: "GET", query, signal },
  );
}

export async function listLocationManagerLocations(
  api: DashboardApiClient,
  organizationId: string,
  page: SelectorPageInput = {},
  signal?: AbortSignal,
): Promise<ManagementLocationsResponse> {
  const query = boundedSelectorPage(page);
  return api.request(
    `/v1/staff/dashboard/organizations/${encodeURIComponent(organizationId)}/locations`,
    managementLocationsResponseSchema,
    { method: "GET", query, signal },
  );
}

export function readLocationManagerSubscription(
  api: DashboardApiClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<LocationSubscriptionResponse> {
  return api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/subscription`,
    locationSubscriptionResponseSchema,
    { method: "GET", signal },
  );
}

export function readDashboardFeatureAuthority(
  api: DashboardApiClient,
  query: DashboardFeatureAuthorityQuery,
  signal?: AbortSignal,
): Promise<DashboardFeatureAuthorityResponse> {
  const parsed = dashboardFeatureAuthorityQuerySchema.parse(query);
  return api.request(
    "/v1/staff/dashboard/feature-authority",
    dashboardFeatureAuthorityResponseSchema,
    { method: "GET", query: parsed, signal },
  );
}

export async function listActiveSupervisorScopes(
  api: DashboardApiClient,
  signal?: AbortSignal,
): Promise<readonly SupervisorCandidate[]> {
  const response = await api.request(
    "/v1/staff/operational-context",
    staffOperationalContextResponseSchema,
    { method: "GET", signal },
  );
  return response.contexts.flatMap(toSupervisorCandidate);
}

function toSupervisorCandidate(
  context: StaffOperationalMembershipContext,
): readonly SupervisorCandidate[] {
  if (context.role !== "VALET_SUPERVISOR" || context.activeShift === null) return [];
  const location = context.eligibleLocations.find(
    (candidate) => candidate.locationId === context.activeShift?.locationId,
  );
  if (location === undefined) return [];
  return [
    {
      authority: "SUPERVISOR",
      membershipId: context.membershipId,
      organization: context.organization,
      location,
      activeShift: context.activeShift,
    },
  ];
}

/** Preserve every authority-bearing membership/scope instead of choosing a global role. */
export function composeDashboardCandidates(input: {
  readonly companyAdmin?: readonly CompanyAdminCandidate[];
  readonly locationManager?: readonly LocationManagerCandidate[];
  readonly supervisor?: readonly SupervisorCandidate[];
}): readonly DashboardScopeCandidate[] {
  return [
    ...(input.companyAdmin ?? []),
    ...(input.locationManager ?? []),
    ...(input.supervisor ?? []),
  ];
}
