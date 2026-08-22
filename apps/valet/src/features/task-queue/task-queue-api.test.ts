import type { TaskQueueResponse } from "@valet/contracts";
import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { fetchTaskQueue } from "./task-queue-api";

describe("fetchTaskQueue API", () => {
  it("requests endpoint with locationId param and parses valid response", async () => {
    const mockPayload: TaskQueueResponse = {
      tasks: [
        {
          taskId: "11111111-1111-4111-8111-111111111111",
          sessionId: "22222222-2222-4222-8222-222222222222",
          taskType: "PARKING",
          status: "QUEUED",
          currentAssigneeMembershipId: null,
          valetSessionState: "AWAITING_PARKING",
          valetSessionVersion: 2,
          version: 1,
          createdAt: "2026-08-21T18:00:00.000Z",
          parkingZone: "Zone A",
          parkingSpot: null,
          retrievalRequestedAt: null,
          vehicle: {
            make: "Toyota",
            model: "Camry",
            color: "Silver",
            plateNumberRaw: "87-65432",
            temporaryDescriptor: null,
          },
        },
      ],
    };

    const mockClient = {
      request: vi.fn().mockResolvedValue(mockPayload),
    } as unknown as EmployeeApiClient;

    const res = await fetchTaskQueue(
      mockClient,
      "44444444-4444-4444-8444-444444444444",
    );
    expect(res).toEqual(mockPayload);
    expect(mockClient.request).toHaveBeenCalledWith("/v1/staff/tasks/queue", {
      method: "GET",
      params: { locationId: "44444444-4444-4444-8444-444444444444" },
      signal: undefined,
      requireAuth: true,
    });
  });

  it("rejects invalid payload violating taskQueueResponseSchema", async () => {
    const invalidPayload = {
      tasks: [
        {
          taskId: "not-a-uuid",
        },
      ],
    };

    const mockClient = {
      request: vi.fn().mockResolvedValue(invalidPayload),
    } as unknown as EmployeeApiClient;

    await expect(
      fetchTaskQueue(mockClient, "44444444-4444-4444-8444-444444444444"),
    ).rejects.toThrow();
  });
});
