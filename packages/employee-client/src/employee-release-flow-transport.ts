import {
  completeHandoffRequestSchema,
  completeHandoffResponseSchema,
  staffPaymentProjectionResponseSchema,
  staffValetSessionDetailResponseSchema,
  taskQueueResponseSchema,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeClient } from "./employee-client";
import type { EmployeeReleaseTransport } from "./employee-release-flow-types";

function parse<T>(
  schema: { safeParse(value: unknown): unknown },
  value: unknown,
) {
  const parsed = schema.safeParse(value) as
    { readonly data: T; readonly success: true } | { readonly success: false };
  if (!parsed.success) {
    throw new EmployeeApiError({
      code: "RELEASE_RESPONSE_INVALID",
      message: "The vehicle release response was invalid.",
      status: 502,
    });
  }
  return parsed.data;
}

export function createEmployeeReleaseTransport(
  clientOrFactory: EmployeeClient | (() => EmployeeClient),
): EmployeeReleaseTransport {
  const client = () =>
    typeof clientOrFactory === "function" ? clientOrFactory() : clientOrFactory;
  return {
    async complete(id, expectedSessionVersion) {
      return parse(
        completeHandoffResponseSchema,
        await client().request<unknown>({
          body: completeHandoffRequestSchema.parse({ expectedSessionVersion }),
          method: "POST",
          path: `/v1/staff/valet-sessions/${id}/complete-handoff`,
        }),
      );
    },
    async loadPayment(id) {
      return parse(
        staffPaymentProjectionResponseSchema,
        await client().request<unknown>({
          method: "GET",
          path: `/v1/staff/valet-sessions/${id}/payment`,
        }),
      );
    },
    async loadSession(id) {
      return parse(
        staffValetSessionDetailResponseSchema,
        await client().request<unknown>({
          method: "GET",
          path: `/v1/staff/valet-sessions/${id}`,
        }),
      );
    },
    async loadTaskQueue(locationId) {
      return parse(
        taskQueueResponseSchema,
        await client().request<unknown>({
          method: "GET",
          params: { locationId },
          path: "/v1/staff/tasks/queue",
        }),
      );
    },
  };
}
