import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffTaskQueueItem, TaskQueueResponse } from "@valet/contracts";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type {
  EmployeeApiClient,
  EmployeeRequestOptions,
} from "../../lib/api/employee-api-client";
import { TaskQueueController } from "./task-queue-controller";

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const sampleTask: StaffTaskQueueItem = {
  taskId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  taskType: "PARKING",
  status: "QUEUED",
  currentAssigneeMembershipId: null,
  version: 1,
  createdAt: "2026-08-21T18:00:00.000Z",
  parkingZone: "Zone A",
  parkingSpot: null,
  retrievalRequestedAt: null,
  vehicle: {
    make: "Toyota",
    model: "Camry",
    color: "White",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
};

describe("TaskQueueController Lifecycle & Invariants", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("performs initial fetch and polls on ~5s cadence without overlapping calls", async () => {
    let callCount = 0;
    let inFlightCount = 0;
    let maxConcurrent = 0;

    const mockApiClient = {
      request: vi.fn().mockImplementation(async () => {
        callCount++;
        inFlightCount++;
        maxConcurrent = Math.max(maxConcurrent, inFlightCount);
        await new Promise((r) => setTimeout(r, 100));
        inFlightCount--;
        return { tasks: [sampleTask] } as TaskQueueResponse;
      }),
    } as unknown as EmployeeApiClient;

    const controller = new TaskQueueController({
      apiClient: mockApiClient,
      pollingIntervalMs: 5000,
    });

    controller.setScope("authenticated", "loc-1");
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(controller.getState().tasks).toHaveLength(1);

    // 5 seconds tick
    await vi.advanceTimersByTimeAsync(5000);
    expect(callCount).toBe(2);

    // Another 5 seconds tick
    await vi.advanceTimersByTimeAsync(5000);
    expect(callCount).toBe(3);

    // Ensure concurrency never exceeded 1
    expect(maxConcurrent).toBe(1);

    controller.destroy();
  });

  it("halts polling completely on 401, 403, and 404 hard-stops", async () => {
    for (const status of [401, 403, 404]) {
      const onAuthLoss = vi.fn();
      const mockApiClient = {
        request: vi.fn().mockRejectedValue(
          new EmployeeApiError({
            status,
            code: "AUTH_LOSS",
            message: `Scope revoked with ${status}`,
          }),
        ),
      } as unknown as EmployeeApiClient;

      const controller = new TaskQueueController({
        apiClient: mockApiClient,
        pollingIntervalMs: 5000,
        onAuthorizationLoss: onAuthLoss,
      });

      controller.setScope("authenticated", `loc-${status}`);
      await flushAsync();

      expect(controller.getState().tasks).toEqual([]);
      expect(controller.getState().isHardStopped).toBe(true);
      expect(onAuthLoss).toHaveBeenCalledTimes(1);

      // Verify no interval calls occur after hard-stop
      await vi.advanceTimersByTimeAsync(20000);
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);

      controller.destroy();
    }
  });

  it("discards late pending response from Location A when switching to Location B", async () => {
    let resolveLocA: (val: TaskQueueResponse) => void = () => {};

    const mockApiClient = {
      request: vi
        .fn()
        .mockImplementation((_p: string, opts?: EmployeeRequestOptions) => {
          const loc = opts?.params?.["locationId"];
          if (loc === "loc-A") {
            return new Promise((res) => {
              resolveLocA = res;
            });
          }
          return Promise.resolve({
            tasks: [
              {
                ...sampleTask,
                taskId: "22222222-2222-4222-8222-222222222222",
              },
            ],
          });
        }),
    } as unknown as EmployeeApiClient;

    const controller = new TaskQueueController({
      apiClient: mockApiClient,
    });

    controller.setScope("authenticated", "loc-A");
    expect(controller.getState().scopeLocationId).toBe("loc-A");
    expect(controller.getState().tasks).toEqual([]);

    // Switch to Location B while A is still pending
    controller.setScope("authenticated", "loc-B");
    await flushAsync();

    expect(controller.getState().scopeLocationId).toBe("loc-B");
    expect(controller.getState().tasks[0]?.taskId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );

    // Resolve Location A late -> MUST NOT overwrite Location B!
    resolveLocA({ tasks: [sampleTask] });
    await flushAsync();

    expect(controller.getState().scopeLocationId).toBe("loc-B");
    expect(controller.getState().tasks[0]?.taskId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );

    controller.destroy();
  });

  it("retains safe current-scope tasks during transient 500 network errors", async () => {
    const mockApiClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ tasks: [sampleTask] })
        .mockRejectedValueOnce(
          new EmployeeApiError({
            status: 500,
            code: "SERVER_ERROR",
            message: "Temporary outage",
          }),
        ),
    } as unknown as EmployeeApiClient;

    const controller = new TaskQueueController({
      apiClient: mockApiClient,
      pollingIntervalMs: 5000,
    });

    controller.setScope("authenticated", "loc-1");
    await flushAsync();
    expect(controller.getState().tasks).toHaveLength(1);

    // Trigger poll that fails with 500
    await vi.advanceTimersByTimeAsync(5000);
    await flushAsync();

    expect(controller.getState().tasks).toHaveLength(1);
    expect(controller.getState().error).not.toBeNull();
    expect(controller.getState().isHardStopped).toBe(false);

    controller.destroy();
  });

  it("hides tasks on logout and aborts outstanding request on cleanup", async () => {
    let capturedSignal: AbortSignal | undefined;

    const mockApiClient = {
      request: vi
        .fn()
        .mockImplementation((_p: string, opts?: EmployeeRequestOptions) => {
          capturedSignal = opts?.signal;
          return new Promise(() => {});
        }),
    } as unknown as EmployeeApiClient;

    const controller = new TaskQueueController({
      apiClient: mockApiClient,
    });

    controller.setScope("authenticated", "loc-1");
    expect(capturedSignal?.aborted).toBe(false);

    // Logout
    controller.setScope("unauthenticated", null);
    expect(controller.getState().tasks).toEqual([]);
    expect(controller.getState().scopeLocationId).toBeNull();
    expect(capturedSignal?.aborted).toBe(true);

    controller.destroy();
  });

  it("pauses on hidden/offline and resumes on visible/online when not hard-stopped", async () => {
    const mockApiClient = {
      request: vi.fn().mockResolvedValue({ tasks: [sampleTask] }),
    } as unknown as EmployeeApiClient;

    const controller = new TaskQueueController({
      apiClient: mockApiClient,
      pollingIntervalMs: 5000,
    });

    controller.setScope("authenticated", "loc-1");
    expect(mockApiClient.request).toHaveBeenCalledTimes(1);

    // Hidden pauses timer
    controller.handleVisibilityChange(false);
    await vi.advanceTimersByTimeAsync(15000);
    expect(mockApiClient.request).toHaveBeenCalledTimes(1);

    // Visible resumes
    controller.handleVisibilityChange(true);
    expect(mockApiClient.request).toHaveBeenCalledTimes(2);

    // Offline pauses timer
    controller.handleOffline();
    await vi.advanceTimersByTimeAsync(15000);
    expect(mockApiClient.request).toHaveBeenCalledTimes(2);

    // Online resumes
    controller.handleOnline();
    expect(mockApiClient.request).toHaveBeenCalledTimes(3);

    controller.destroy();
  });
});
