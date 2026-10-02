import {
  staffShiftHistoryResponseSchema,
  staffShiftHistoryDetailSchema,
  staffShiftEmployeePageSchema,
  type StaffShiftHistoryQuery,
  type StaffShiftEmployeeQuery,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
const base = (org: string) =>
  `/v1/staff/management/organizations/${org}/shifts`;
export function readShiftHistory(
  api: DashboardApiClient,
  org: string,
  query: StaffShiftHistoryQuery,
  signal: AbortSignal,
) {
  return api.request(base(org), staffShiftHistoryResponseSchema, {
    query,
    signal,
  });
}
export function readShiftDetail(
  api: DashboardApiClient,
  org: string,
  shiftId: string,
  signal: AbortSignal,
) {
  return api.request(`${base(org)}/${shiftId}`, staffShiftHistoryDetailSchema, {
    signal,
  });
}
export function readShiftEmployees(
  api: DashboardApiClient,
  org: string,
  query: StaffShiftEmployeeQuery,
  signal: AbortSignal,
) {
  return api.request(`${base(org)}/employees`, staffShiftEmployeePageSchema, {
    query,
    signal,
  });
}
