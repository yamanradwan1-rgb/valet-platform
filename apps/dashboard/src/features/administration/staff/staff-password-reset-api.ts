import {
  staffPasswordResetIssueResponseSchema,
  staffPasswordResetStatusResponseSchema,
  type StaffPasswordResetIssueRequest,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

export function staffResetManagementPath(organizationId: string, membershipId: string) {
  return `/v1/staff/management/organizations/${organizationId}/staff/${membershipId}/password-resets`;
}

export function readStaffPasswordResetStatus(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  signal?: AbortSignal,
) {
  return api.request(
    `${staffResetManagementPath(organizationId, membershipId)}/status`,
    staffPasswordResetStatusResponseSchema,
    { signal },
  );
}

export function issueStaffPasswordReset(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  command: StaffPasswordResetIssueRequest,
) {
  return api.request(
    staffResetManagementPath(organizationId, membershipId),
    staffPasswordResetIssueResponseSchema,
    { method: "POST", body: command },
  );
}
