import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { TaskQueueController } from "./task-queue-controller";

describe("TaskQueueController successful snapshot identity", () => {
  it("advances monotonically across same-workspace auth token refresh", async () => {
    const client = {
      request: vi.fn(async () => ({ tasks: [] })),
    } as unknown as EmployeeApiClient;
    const controller = new TaskQueueController({ apiClient: client });

    controller.setScope("authenticated", 1, "location-a");
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getState().successfulSnapshotCount).toBe(1);

    controller.setScope("authenticated", 2, "location-a");
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getState().successfulSnapshotCount).toBe(2);
    controller.destroy();
  });
});
