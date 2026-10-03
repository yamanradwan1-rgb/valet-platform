import {
  cancelBeforeParkingRequestSchema,
  cancelBeforeParkingResponseSchema,
  parkingCancellationStatusResponseSchema,
} from "@valet/contracts";
import type { EmployeeClient } from "./employee-client";
import { EmployeeApiError } from "./api-error";
import type { EmployeeParkingCancellationTransport } from "./employee-parking-cancellation-types";

function parse<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new EmployeeApiError({
      code: "PARKING_CANCELLATION_RESPONSE_INVALID",
      message: "The cancellation response was invalid.",
      status: 502,
    });
  return parsed.data as T;
}
export function createEmployeeParkingCancellationTransport(
  clientFactory: () => EmployeeClient,
): EmployeeParkingCancellationTransport {
  return {
    async cancel(target) {
      const body = cancelBeforeParkingRequestSchema.parse({
        taskId: target.taskId,
        expectedShiftId: target.expectedShiftId,
        expectedSessionVersion: target.expectedSessionVersion,
        expectedTaskVersion: target.expectedTaskVersion,
      });
      const result = await clientFactory().request<unknown>({
        method: "POST",
        body,
        path: `/v1/staff/valet-sessions/${target.sessionId}/cancel-before-parking`,
      });
      return parse(cancelBeforeParkingResponseSchema, result);
    },
    async status(target) {
      const result = await clientFactory().request<unknown>({
        method: "GET",
        params: {
          taskId: target.taskId,
          expectedShiftId: target.expectedShiftId,
        },
        path: `/v1/staff/valet-sessions/${target.sessionId}/parking-cancellation-status`,
      });
      return parse(parkingCancellationStatusResponseSchema, result);
    },
  };
}
