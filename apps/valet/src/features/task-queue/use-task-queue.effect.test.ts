import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskQueueResponse, StaffTaskQueueItem } from "@valet/contracts";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type {
  EmployeeApiClient,
  EmployeeRequestOptions,
} from "../../lib/api/employee-api-client";
import { useTaskQueue, type UseTaskQueueOptions } from "./use-task-queue";
import * as authContextModule from "../../lib/auth/staff-auth-context";
import { renderHookWithEffects } from "../../test/hook-effect-runner";
import type { StaffAuthClient } from "../../lib/auth/staff-auth-client";

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("useTaskQueue Effect & Polling Lifecycle", () => {
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

  const setupAuth = (authenticated = true) => {
    vi.spyOn(authContextModule, "useOptionalStaffAuth").mockReturnValue(
      authenticated
        ? {
            status: "authenticated",
            session: {
              accessToken: "token_123",
              tokenType: "Bearer",
              accessExpiresAt: "2026-08-21T19:00:00.000Z",
              sessionExpiresAt: "2026-08-22T18:00:00.000Z",
            },
            client: {} as StaffAuthClient,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn(),
          }
        : {
            status: "unauthenticated",
            session: null,
            client: {} as StaffAuthClient,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn(),
          },
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();

    const eventListeners: Record<string, Array<() => void>> = {};
    (globalThis as unknown as { document: unknown }).document = {
      visibilityState: "visible",
      addEventListener: (evt: string, cb: () => void) => {
        const list = eventListeners[`doc:${evt}`] ?? [];
        list.push(cb);
        eventListeners[`doc:${evt}`] = list;
      },
      removeEventListener: (evt: string, cb: () => void) => {
        const list = eventListeners[`doc:${evt}`] ?? [];
        eventListeners[`doc:${evt}`] = list.filter((f) => f !== cb);
      },
      dispatchEvent: (evt: string) => {
        const list = eventListeners[`doc:${evt}`] ?? [];
        list.forEach((cb) => cb());
      },
    };

    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: (evt: string, cb: () => void) => {
        const list = eventListeners[`win:${evt}`] ?? [];
        list.push(cb);
        eventListeners[`win:${evt}`] = list;
      },
      removeEventListener: (evt: string, cb: () => void) => {
        const list = eventListeners[`win:${evt}`] ?? [];
        eventListeners[`win:${evt}`] = list.filter((f) => f !== cb);
      },
      dispatchEvent: (evt: string) => {
        const list = eventListeners[`win:${evt}`] ?? [];
        list.forEach((cb) => cb());
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts polling on ~5s cadence when authenticated and has locationId", async () => {
    setupAuth(true);

    const mockRequest = vi.fn().mockResolvedValue({
      tasks: [sampleTask],
    } as TaskQueueResponse);

    const mockClient = {
      request: mockRequest,
    } as unknown as EmployeeApiClient;

    const harness = renderHookWithEffects(
      (props: UseTaskQueueOptions) => useTaskQueue(props),
      {
        locationId: "loc-1",
        client: mockClient,
        pollingIntervalMs: 5000,
      },
    );

    // Initial poll fired immediately
    expect(mockRequest).toHaveBeenCalledTimes(1);

    await flushAsync();
    harness.rerender();

    expect(harness.current.tasks).toHaveLength(1);
    expect(harness.current.tasks[0]?.taskId).toBe(sampleTask.taskId);

    // Advance 5 seconds -> second poll fires
    await vi.advanceTimersByTimeAsync(5000);
    await flushAsync();
    expect(mockRequest).toHaveBeenCalledTimes(2);

    // Advance another 5 seconds -> third poll fires
    await vi.advanceTimersByTimeAsync(5000);
    await flushAsync();
    expect(mockRequest).toHaveBeenCalledTimes(3);

    harness.unmount();
  });

  it("halts polling completely and zeroes tasks on 403 Forbidden", async () => {
    setupAuth(true);

    const error403 = new EmployeeApiError({
      status: 403,
      code: "FORBIDDEN",
      message: "Scope revoked",
    });

    const mockRequest = vi.fn().mockRejectedValue(error403);
    const onAuthLoss = vi.fn();

    const mockClient = {
      request: mockRequest,
    } as unknown as EmployeeApiClient;

    const harness = renderHookWithEffects(
      (props: UseTaskQueueOptions) => useTaskQueue(props),
      {
        locationId: "loc-forbidden",
        client: mockClient,
        pollingIntervalMs: 5000,
        onAuthorizationLoss: onAuthLoss,
      },
    );

    await flushAsync();
    harness.rerender();

    expect(harness.current.tasks).toEqual([]);
    expect(harness.current.isHardStopped).toBe(true);
    expect(onAuthLoss).toHaveBeenCalledTimes(1);

    // Advancing timers does NOT trigger any further polling requests
    await vi.advanceTimersByTimeAsync(15000);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    harness.unmount();
  });

  it("synchronously isolates Location A from Location B during switch", async () => {
    setupAuth(true);

    let resolveLocA: (val: TaskQueueResponse) => void = () => {};
    let resolveLocB: (val: TaskQueueResponse) => void = () => {};

    const mockRequest = vi
      .fn()
      .mockImplementation((_path: string, opts?: EmployeeRequestOptions) => {
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
      });

    const mockClient = {
      request: mockRequest,
    } as unknown as EmployeeApiClient;

    const harness = renderHookWithEffects(
      (props: UseTaskQueueOptions) => useTaskQueue(props),
      {
        locationId: "loc-A",
        client: mockClient,
      },
    );

    // Resolve Location A
    resolveLocA({ tasks: [sampleTask] });
    await flushAsync();
    harness.rerender();

    expect(harness.current.tasks).toHaveLength(1);

    // Switch to Location B
    harness.rerender({
      locationId: "loc-B",
      client: mockClient,
    });

    // SYNCHRONOUS INVARIANT: tasks is [] before B resolves
    expect(harness.current.tasks).toEqual([]);

    // Resolve Location B
    const taskB = {
      ...sampleTask,
      taskId: "22222222-2222-4222-8222-222222222222",
    };
    resolveLocB({ tasks: [taskB] });
    await flushAsync();
    harness.rerender();

    expect(harness.current.tasks).toHaveLength(1);
    expect(harness.current.tasks[0]?.taskId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );

    harness.unmount();
  });

  it("clears tasks and stops polling on logout", async () => {
    setupAuth(true);

    const mockRequest = vi.fn().mockResolvedValue({
      tasks: [sampleTask],
    } as TaskQueueResponse);

    const mockClient = {
      request: mockRequest,
    } as unknown as EmployeeApiClient;

    const harness = renderHookWithEffects(
      (props: UseTaskQueueOptions) => useTaskQueue(props),
      {
        locationId: "loc-1",
        client: mockClient,
      },
    );

    await flushAsync();
    harness.rerender();
    expect(harness.current.tasks).toHaveLength(1);

    // Logout
    setupAuth(false);
    harness.rerender();

    expect(harness.current.tasks).toEqual([]);
    harness.unmount();
  });
});
