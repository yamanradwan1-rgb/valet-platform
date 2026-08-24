import {
  staffValetSessionDetailResponseSchema,
  type StaffValetSessionDetailResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export type { StaffValetSessionDetailResponse };

export interface StaffSessionRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * Reusable authoritative Staff ValetSession detail read. Shared by Check-In
 * and the Guest Access flow; every caller receives the same safe projection
 * parsed through the shared contract schema.
 */
export async function fetchStaffSessionDetail(
  client: EmployeeApiClient,
  sessionId: string,
  options: StaffSessionRequestOptions = {},
): Promise<StaffValetSessionDetailResponse> {
  const raw = await client.request<unknown>(
    `/v1/staff/valet-sessions/${sessionId}`,
    {
      method: "GET",
      requireAuth: true,
      signal: options.signal,
    },
  );
  return staffValetSessionDetailResponseSchema.parse(raw);
}
