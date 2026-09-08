import {
  abortHandoffResponseSchema,
  handoffReasonRequestSchema,
  handoffVersionRequestSchema,
  initiateHandoffResponseSchema,
  staffValetSessionDetailResponseSchema,
  taskQueueResponseSchema,
  verifiedHandoffResponseSchema,
  verifyDynamicQrRequestSchema,
  verifyPickupCodeRequestSchema,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeClient } from "./employee-client";
import type { EmployeeHandoffTransport } from "./employee-handoff-flow-types";

function parse<T>(
  schema: { safeParse(value: unknown): unknown },
  value: unknown,
): T {
  const parsed = schema.safeParse(value) as
    { readonly data: T; readonly success: true } | { readonly success: false };
  if (!parsed.success)
    throw new EmployeeApiError({
      code: "HANDOFF_RESPONSE_INVALID",
      message: "The handoff response was invalid.",
      status: 502,
    });
  return parsed.data;
}

export function createEmployeeHandoffTransport(
  clientOrFactory: EmployeeClient | (() => EmployeeClient),
): EmployeeHandoffTransport {
  const client = () =>
    typeof clientOrFactory === "function" ? clientOrFactory() : clientOrFactory;
  const post = async <T>(
    path: string,
    body: unknown,
    schema: { safeParse(value: unknown): unknown },
  ) =>
    parse<T>(
      schema,
      await client().request<unknown>({ body, method: "POST", path }),
    );
  return {
    abort: (id, expectedSessionVersion, reason) =>
      post(
        `/v1/staff/valet-sessions/${id}/abort-handoff`,
        handoffReasonRequestSchema.parse({ expectedSessionVersion, reason }),
        abortHandoffResponseSchema,
      ),
    initiate: (id, expectedSessionVersion) =>
      post(
        `/v1/staff/valet-sessions/${id}/initiate-handoff`,
        handoffVersionRequestSchema.parse({ expectedSessionVersion }),
        initiateHandoffResponseSchema,
      ),
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
    override: (id, expectedSessionVersion, reason) =>
      post(
        `/v1/staff/valet-sessions/${id}/supervisor-override-handoff`,
        handoffReasonRequestSchema.parse({ expectedSessionVersion, reason }),
        verifiedHandoffResponseSchema,
      ),
    verifyDynamicQr: (id, expectedSessionVersion, qrPayload) =>
      post(
        `/v1/staff/valet-sessions/${id}/verify-dynamic-qr`,
        verifyDynamicQrRequestSchema.parse({
          expectedSessionVersion,
          qrPayload,
        }),
        verifiedHandoffResponseSchema,
      ),
    verifyPickupCode: (id, expectedSessionVersion, pickupCode) =>
      post(
        `/v1/staff/valet-sessions/${id}/verify-pickup-code`,
        verifyPickupCodeRequestSchema.parse({
          expectedSessionVersion,
          pickupCode,
        }),
        verifiedHandoffResponseSchema,
      ),
  };
}
