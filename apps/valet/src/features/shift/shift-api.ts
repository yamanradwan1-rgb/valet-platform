import {
  endShiftResponseSchema,
  type EndShiftResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type { EndShiftResponse };

/**
 * Authoritative End Shift command per DEC-032 §7 / DEC-052 §7.
 * Route and strict body are owned by packages/contracts; no new backend
 * semantics exist. An already-ended self-owned Shift returns the persisted
 * ended Shift idempotently.
 */
export async function endShiftSession(
  client: EmployeeApiClient,
  shiftId: string,
  cashReported: string,
): Promise<EndShiftResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/shifts/${shiftId}/end`,
    {
      method: "POST",
      body: { cashReported },
      requireAuth: true,
    },
  );
  return endShiftResponseSchema.parse(raw);
}
