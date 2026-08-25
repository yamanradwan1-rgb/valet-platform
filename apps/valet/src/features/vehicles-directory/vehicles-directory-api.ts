import {
  staffVehicleDirectoryResponseSchema,
  type StaffVehicleDirectoryResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type {
  StaffVehicleDirectoryResponse,
  StaffVehicleDirectoryRow,
  StaffVehicleDirectoryVehicle,
} from "@valet/contracts";

export interface GetStaffVehicleDirectoryOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * Employee vehicle-directory read (DEC-066 §6): GET the narrow operational
 * directory for one Location and parse the payload STRICTLY against the
 * shared contract. An invalid payload throws — the caller renders an error
 * state; partial or fabricated rows are never rendered (fail closed).
 */
export async function fetchStaffVehicleDirectory(
  client: EmployeeApiClient,
  locationId: string,
  options: GetStaffVehicleDirectoryOptions = {},
): Promise<StaffVehicleDirectoryResponse> {
  const raw = await client.request<unknown>(
    "/v1/staff/valet-sessions/directory",
    {
      method: "GET",
      params: { locationId },
      signal: options.signal,
      requireAuth: true,
    },
  );

  return staffVehicleDirectoryResponseSchema.parse(raw);
}
