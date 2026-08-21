import {
  taskQueueResponseSchema,
  type TaskQueueResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export interface GetTaskQueueOptions {
  readonly signal?: AbortSignal | undefined;
}

export async function fetchTaskQueue(
  client: EmployeeApiClient,
  locationId: string,
  options: GetTaskQueueOptions = {},
): Promise<TaskQueueResponse> {
  const raw = await client.request<unknown>("/v1/staff/tasks/queue", {
    method: "GET",
    params: { locationId },
    signal: options.signal,
    requireAuth: true,
  });

  return taskQueueResponseSchema.parse(raw);
}
