import {
  parkingTaskQueueResponseSchema,
  staffValetSessionDetailResponseSchema,
  startParkingRequestSchema,
  startParkingResponseSchema,
  taskQueueResponseSchema,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeClient } from "./employee-client";
import type { EmployeeParkingStartTransport } from "./employee-parking-start-types";

function invalidResponse(): EmployeeApiError {
  return new EmployeeApiError({
    code: "PARKING_START_RESPONSE_INVALID",
    message: "The Parking Start response was invalid.",
    status: 502,
  });
}

function parse<T>(
  schema: { safeParse(value: unknown): unknown },
  value: unknown,
): T {
  const parsed = schema.safeParse(value) as
    { readonly data: T; readonly success: true } | { readonly success: false };
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

export function createEmployeeParkingStartTransport(
  clientOrFactory: EmployeeClient | (() => EmployeeClient),
): EmployeeParkingStartTransport {
  const client = () =>
    typeof clientOrFactory === "function" ? clientOrFactory() : clientOrFactory;
  return {
    async loadSession(sessionId) {
      const value = await client().request<unknown>({
        method: "GET",
        path: `/v1/staff/valet-sessions/${sessionId}`,
      });
      return parse(staffValetSessionDetailResponseSchema, value);
    },
    async loadTaskQueue(locationId) {
      const value = await client().request<unknown>({
        method: "GET",
        params: { locationId },
        path: "/v1/staff/tasks/queue",
      });
      return parse(taskQueueResponseSchema, value);
    },
    async queueParkingTask(sessionId) {
      const value = await client().request<unknown>({
        body: {},
        method: "POST",
        path: `/v1/staff/valet-sessions/${sessionId}/parking-task/queue`,
      });
      return parse(parkingTaskQueueResponseSchema, value);
    },
    async startParking(sessionId, expectedSessionVersion, expectedTaskVersion) {
      const body = startParkingRequestSchema.parse({
        expectedSessionVersion,
        expectedTaskVersion,
      });
      const value = await client().request<unknown>({
        body,
        method: "POST",
        path: `/v1/staff/valet-sessions/${sessionId}/start-parking`,
      });
      return parse(startParkingResponseSchema, value);
    },
  };
}
