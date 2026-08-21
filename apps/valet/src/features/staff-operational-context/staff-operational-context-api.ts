import {
  staffOperationalContextResponseSchema,
  type StaffOperationalContextResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export interface GetStaffOperationalContextOptions {
  readonly signal?: AbortSignal | undefined;
}

export async function fetchStaffOperationalContext(
  client: EmployeeApiClient,
  options: GetStaffOperationalContextOptions = {},
): Promise<StaffOperationalContextResponse> {
  const raw = await client.request<unknown>("/v1/staff/operational-context", {
    method: "GET",
    signal: options.signal,
    requireAuth: true,
  });

  return staffOperationalContextResponseSchema.parse(raw);
}
