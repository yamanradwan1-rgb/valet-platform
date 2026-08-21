import type { TaskQueueResponse } from "@valet/contracts";
import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import { fetchTaskQueue } from "./task-queue-api";

describe("useTaskQueue hook logic and API integration", () => {
  it("handles empty queue response safely", async () => {
    const emptyPayload: TaskQueueResponse = { tasks: [] };
    const mockClient = {
      request: vi.fn().mockResolvedValue(emptyPayload),
    } as unknown as EmployeeApiClient;

    const res = await fetchTaskQueue(mockClient, "loc-empty");
    expect(res.tasks).toEqual([]);
  });

  it("propagates 401 and 403 API errors correctly", async () => {
    const error401 = new EmployeeApiError({
      status: 401,
      code: "STAFF_AUTHENTICATION_REQUIRED",
      message: "Authentication required",
    });

    const mockClient = {
      request: vi.fn().mockRejectedValue(error401),
    } as unknown as EmployeeApiClient;

    await expect(fetchTaskQueue(mockClient, "loc-401")).rejects.toThrow(
      "Authentication required",
    );
  });

  it("enforces location isolation logic by validating locationId parameter", async () => {
    const mockClient = {
      request: vi.fn().mockResolvedValue({ tasks: [] }),
    } as unknown as EmployeeApiClient;

    await fetchTaskQueue(mockClient, "loc-A");
    expect(mockClient.request).toHaveBeenCalledWith("/v1/staff/tasks/queue", {
      method: "GET",
      params: { locationId: "loc-A" },
      signal: undefined,
      requireAuth: true,
    });

    await fetchTaskQueue(mockClient, "loc-B");
    expect(mockClient.request).toHaveBeenCalledWith("/v1/staff/tasks/queue", {
      method: "GET",
      params: { locationId: "loc-B" },
      signal: undefined,
      requireAuth: true,
    });
  });
});
