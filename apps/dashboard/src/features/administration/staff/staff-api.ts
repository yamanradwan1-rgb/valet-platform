import {
  activeShiftOverviewResponseSchema,
  staffDirectoryResponseSchema,
  staffLocationAccessPageSchema,
  staffLocationCandidatePageSchema,
  staffMembershipDetailSchema,
  type StaffLocationAccessCommand,
  type StaffManagementRole,
  type StaffRoleCommand,
  type StaffStatusCommand,
  type StaffDirectoryQuery,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

function base(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/staff`;
}

export function readStaffDirectory(
  api: DashboardApiClient,
  organizationId: string,
  cursor: string | null,
  signal?: AbortSignal,
  filters: Omit<StaffDirectoryQuery, "limit" | "cursor"> = {},
) {
  return api.request(base(organizationId), staffDirectoryResponseSchema, {
    query: { ...filters, limit: 50, cursor },
    signal,
  });
}

export function readStaffDetail(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  signal?: AbortSignal,
) {
  return api.request(
    `${base(organizationId)}/${membershipId}`,
    staffMembershipDetailSchema,
    { signal },
  );
}

export function setStaffRole(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  role: StaffManagementRole,
  expectedVersion: number,
) {
  const body: StaffRoleCommand = { expectedVersion, role };
  return api.request(
    `${base(organizationId)}/${membershipId}/role`,
    staffMembershipDetailSchema,
    {
      body,
      method: "POST",
    },
  );
}

export function setStaffStatus(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  status: "ACTIVE" | "INACTIVE",
  expectedVersion: number,
) {
  const body: StaffStatusCommand = { expectedVersion };
  const action = status === "ACTIVE" ? "activate" : "deactivate";
  return api.request(
    `${base(organizationId)}/${membershipId}/${action}`,
    staffMembershipDetailSchema,
    {
      body,
      method: "POST",
    },
  );
}

export function changeStaffLocationAccess(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  locationIds: readonly string[] | string,
  expectedVersion: number,
  action: "grant" | "revoke",
) {
  const body: StaffLocationAccessCommand = {
    expectedVersion,
    locationIds:
      typeof locationIds === "string" ? [locationIds] : [...locationIds],
  };
  return api.request(
    `${base(organizationId)}/${membershipId}/location-access/${action}`,
    staffMembershipDetailSchema,
    { body, method: "POST" },
  );
}

export function readStaffLocationAccess(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return api.request(
    `${base(organizationId)}/${membershipId}/location-access`,
    staffLocationAccessPageSchema,
    { query: { limit: 50, cursor }, signal },
  );
}

export function readStaffLocationCandidates(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return api.request(
    `${base(organizationId)}/${membershipId}/location-access/candidates`,
    staffLocationCandidatePageSchema,
    { query: { limit: 50, cursor }, signal },
  );
}

export function readActiveShifts(
  api: DashboardApiClient,
  locationId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  return api.request(
    `/v1/staff/dashboard/locations/${locationId}/overview/active-shifts`,
    activeShiftOverviewResponseSchema,
    { query: { limit: 50, cursor }, signal },
  );
}
