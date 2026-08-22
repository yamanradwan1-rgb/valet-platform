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

    controller.setScope("authenticated", 1, "loc-1");
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(controller.getState().tasks).toHaveLength(1);

    // 5 seconds tick
    await vi.advanceTimersByTimeAsync(5000);
    expect(callCount).toBe(2);

    // Another 5 seconds tick
    await vi.advanceTimersByTimeAsync(5000);
    expect(callCount).toBe(3);

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

      controller.setScope("authenticated", 1, `loc-${status}`);
      await flushAsync();

      expect(controller.getState().tasks).toEqual([]);
      expect(controller.getState().isHardStopped).toBe(true);
      expect(onAuthLoss).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(20000);
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);

      controller.destroy();
    }
  });

  it("handles deferred A -> B switch race without clobbering in-flight request ownership", async () => {
    let resolveLocA: (val: TaskQueueResponse) => void = () => {};
    let resolveLocB: (val: TaskQueueResponse) => void = () => {};

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
          if (loc === "loc-B") {
            return new Promise((res) => {
              resolveLocB = res;
            });
          }
          return Promise.resolve({ tasks: [] });
        }),
    } as unknown as EmployeeApiClient;

    const controller = new TaskQueueController({
      apiClient: mockApiClient,
      pollingIntervalMs: 5000,
    });

    // 1. Location A poll starts
    controller.setScope("authenticated", 1, "loc-A");
    expect(mockApiClient.request).toHaveBeenCalledTimes(1);

    // 2. Switch scope to Location B while A is pending
    controller.setScope("authenticated", 1, "loc-B");
    expect(mockApiClient.request).toHaveBeenCalledTimes(2);

    // 3. Allow A's deferred promise/finally to complete AFTER B has started
    resolveLocA({ tasks: [sampleTask] });
    await flushAsync();

    // 4. Trigger a timer/visibility poll attempt while B is still pending
    controller.handleVisibilityChange(true);
    await vi.advanceTimersByTimeAsync(5000);

    // INVARIANT: In-flight ownership was NOT clobbered by A's finally, so no duplicate call fires
    expect(mockApiClient.request).toHaveBeenCalledTimes(2);

    // 5. Resolve Location B
    const taskB = {
      ...sampleTask,
      taskId: "22222222-2222-4222-8222-222222222222",
    };
    resolveLocB({ tasks: [taskB] });
    await flushAsync();

    expect(controller.getState().scopeLocationId).toBe("loc-B");
    expect(controller.getState().tasks[0]?.taskId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );

    controller.destroy();
  });

  it("does not trigger state change or timer restart after destroy on late resolution", async () => {
    let resolvePending: (val: TaskQueueResponse) => void = () => {};
    const onStateChange = vi.fn();
    const onAuthLoss = vi.fn();

    const mockApiClient = {
      request: vi.fn().mockImplementation(() => {
        return new Promise((res) => {
          resolvePending = res;
        });
      }),
    } as unknown as EmployeeApiClient;

    const controller = new TaskQueueController({
      apiClient: mockApiClient,
      pollingIntervalMs: 5000,
      onStateChange,
      onAuthorizationLoss: onAuthLoss,
    });

    controller.setScope("authenticated", 1, "loc-1");
    onStateChange.mockClear();

    // Destroy while pending
    controller.destroy();

    // Late resolution
    resolvePending({ tasks: [sampleTask] });
    await flushAsync();

    // No callbacks or timer after destroy
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onAuthLoss).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15000);
    expect(mockApiClient.request).toHaveBeenCalledTimes(1);
  });

  it("pauses on hidden/offline and resumes on visible/online when not hard-stopped", async () => {
    const mockApiClient = {
      request: vi.fn().mockResolvedValue({ tasks: [sampleTask] }),
    } as unknown as EmployeeApiClient;

    const controller = new TaskQueueController({
      apiClient: mockApiClient,
      pollingIntervalMs: 5000,
    });

    controller.setScope("authenticated", 1, "loc-1");
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
