import {
  markReadyResponseSchema,
  staffValetSessionDetailResponseSchema,
  startRetrievalResponseSchema,
  taskQueueResponseSchema,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeClient } from "./employee-client";
import type { EmployeeRetrievalTransport } from "./employee-retrieval-flow-types";

function invalidResponse(): EmployeeApiError {
  return new EmployeeApiError({
    code: "RETRIEVAL_RESPONSE_INVALID",
    message: "The Retrieval response was invalid.",
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

/**
 * HTTP transport for the Retrieval workflow. It reuses the existing exact
 * staff contracts and routes; no route, request field or response shape is
 * invented here.
 */
export function createEmployeeRetrievalTransport(
  clientOrFactory: EmployeeClient | (() => EmployeeClient),
): EmployeeRetrievalTransport {
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
    async startRetrieval(
      sessionId,
      expectedSessionVersion,
      expectedTaskVersion,
    ) {
      const value = await client().request<unknown>({
        body: { expectedSessionVersion, expectedTaskVersion },
        method: "POST",
        path: `/v1/staff/valet-sessions/${sessionId}/start-retrieval`,
      });
      return parse(startRetrievalResponseSchema, value);
    },
    async markReady(sessionId, expectedSessionVersion) {
      const value = await client().request<unknown>({
        body: { expectedSessionVersion },
        method: "POST",
        path: `/v1/staff/valet-sessions/${sessionId}/mark-ready`,
      });
      return parse(markReadyResponseSchema, value);
    },
  };
}
