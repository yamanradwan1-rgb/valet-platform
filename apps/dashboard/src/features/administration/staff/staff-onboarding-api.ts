import {
  staffOnboardingResultSchema,
  type StaffOnboardingCreate,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

export function createStaff(
  api: DashboardApiClient,
  org: string,
  command: StaffOnboardingCreate,
) {
  return api.request(
    `/v1/staff/management/organizations/${org}/staff`,
    staffOnboardingResultSchema,
    {
      method: "POST",
      body: command,
    },
  );
}

export function resendStaffInvite(
  api: DashboardApiClient,
  org: string,
  member: string,
  operationId: string,
) {
  return api.request(
    `/v1/staff/management/organizations/${org}/staff/${member}/invitations`,
    staffOnboardingResultSchema,
    {
      method: "POST",
      body: { operationId },
    },
  );
}
