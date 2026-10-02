import {
  staffShiftForceEndRequestSchema,
  staffShiftForceEndResultSchema,
  type StaffShiftForceEndRequest,
  type StaffShiftHistoryEntry,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import type { DashboardApiRequestOptions } from "../../../lib/api/dashboard-api-types";
import { dashboardMalformedError } from "../../../lib/api/dashboard-api-error";

export async function forceEndShift(
  api: DashboardApiClient,
  organizationId: string,
  target: StaffShiftHistoryEntry,
  request: StaffShiftForceEndRequest,
  onAuthReconciled?: DashboardApiRequestOptions["onAuthReconciled"],
) {
  const body = staffShiftForceEndRequestSchema.parse(request);
  const result = await api.request(
    `/v1/staff/management/organizations/${organizationId}/shifts/${target.shiftId}/force-end`,
    staffShiftForceEndResultSchema,
    { method: "POST", body, onAuthReconciled },
  );
  if (
    result.operationId !== body.operationId ||
    result.shiftId !== target.shiftId ||
    result.membershipId !== target.membershipId ||
    result.locationId !== target.location.locationId
  )
    throw dashboardMalformedError();
  return result;
}
