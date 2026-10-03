import {
  confirmParkedRequestSchema,
  confirmParkedResponseSchema,
  parkingSpotValidationQuerySchema,
  parkingSpotValidationResponseSchema,
  staffValetSessionDetailResponseSchema,
  taskQueueResponseSchema,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeClient } from "./employee-client";
import type { EmployeeConfirmParkedTransport } from "./employee-confirm-parked-types";

function parse<T>(
  schema: { safeParse(value: unknown): unknown },
  value: unknown,
): T {
  const parsed = schema.safeParse(value) as
    { readonly data: T; readonly success: true } | { readonly success: false };
  if (!parsed.success) {
    throw new EmployeeApiError({
      code: "CONFIRM_PARKED_RESPONSE_INVALID",
      message: "The Confirm Parked response was invalid.",
      status: 502,
    });
  }
  return parsed.data;
}

export function createEmployeeConfirmParkedTransport(
  clientOrFactory: EmployeeClient | (() => EmployeeClient),
): EmployeeConfirmParkedTransport {
  const client = () =>
    typeof clientOrFactory === "function" ? clientOrFactory() : clientOrFactory;
  return {
    async validateParkingSpot(sessionId, input) {
      const query = parkingSpotValidationQuerySchema.parse(input);
      const value = await client().request<unknown>({
        method: "GET",
        params: Object.fromEntries(
          Object.entries(query).map(([key, value]) => [key, String(value)]),
        ),
        path: `/v1/staff/valet-sessions/${sessionId}/parking-spot-validation`,
      });
      return parse(parkingSpotValidationResponseSchema, value);
    },
    async confirmParked(sessionId, input) {
      const body = confirmParkedRequestSchema.parse(input);
      const value = await client().request<unknown>({
        body,
        method: "POST",
        path: `/v1/staff/valet-sessions/${sessionId}/confirm-parked`,
      });
      return parse(confirmParkedResponseSchema, value);
    },
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
  };
}
