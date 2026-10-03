import {
  cancelCheckInRequestSchema,
  cancelCheckInResponseSchema,
  cancelCheckInStatusResponseSchema,
  staffValetSessionDetailResponseSchema,
  type CancelCheckInRequest,
} from "@valet/contracts";
import type { EmployeeClient } from "./employee-client";

export function createEmployeeCancelCheckInTransport(
  clientFactory: () => EmployeeClient,
) {
  return {
    async prepare(sessionId: string) {
      return staffValetSessionDetailResponseSchema.parse(
        await clientFactory().request({
          method: "GET",
          path: `/v1/staff/valet-sessions/${sessionId}`,
        }),
      );
    },
    async cancel(sessionId: string, request: CancelCheckInRequest) {
      return cancelCheckInResponseSchema.parse(
        await clientFactory().request({
          method: "POST",
          path: `/v1/staff/check-in/sessions/${sessionId}/cancel`,
          body: cancelCheckInRequestSchema.parse(request),
        }),
      );
    },
    async status(sessionId: string, expectedShiftId: string) {
      return cancelCheckInStatusResponseSchema.parse(
        await clientFactory().request({
          method: "GET",
          path: `/v1/staff/check-in/sessions/${sessionId}/cancel-status`,
          params: { expectedShiftId },
        }),
      );
    },
  };
}
export type EmployeeCancelCheckInTransport = ReturnType<
  typeof createEmployeeCancelCheckInTransport
>;
