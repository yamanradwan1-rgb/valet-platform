import {
  endShiftRequestSchema,
  endShiftResponseSchema,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeClient } from "./employee-client";
import type { EmployeeShiftEndTransport } from "./employee-shift-end-types";

export function createEmployeeShiftEndTransport(
  clientOrFactory: EmployeeClient | (() => EmployeeClient),
): EmployeeShiftEndTransport {
  const client = () =>
    typeof clientOrFactory === "function" ? clientOrFactory() : clientOrFactory;
  return {
    async endShift(shiftId, cashReported) {
      const value = await client().request<unknown>({
        body: endShiftRequestSchema.parse({ cashReported }),
        method: "POST",
        path: `/v1/staff/shifts/${shiftId}/end`,
      });
      const parsed = endShiftResponseSchema.safeParse(value);
      if (!parsed.success) {
        throw new EmployeeApiError({
          code: "SHIFT_END_RESPONSE_INVALID",
          message: "The Shift end response was invalid.",
          status: 502,
        });
      }
      return parsed.data;
    },
  };
}
