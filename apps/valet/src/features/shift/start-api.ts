import {
  startShiftResponseSchema,
  type StartShiftResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type { StartShiftResponse };

/**
 * Authoritative Start Shift command per DEC-032. Same-location repeated
 * starts return the existing ACTIVE Shift; a conflicting ACTIVE Shift at a
 * different Location is rejected server-side (ACTIVE_SHIFT_CONFLICT).
 */
export async function startShiftSession(
  client: EmployeeApiClient,
  targetLocationId: string,
): Promise<StartShiftResponse> {
  const raw = await client.request<unknown>(`/v1/staff/shifts/start`, {
    method: "POST",
    body: { targetLocationId },
    requireAuth: true,
  });
  return startShiftResponseSchema.parse(raw);
}
