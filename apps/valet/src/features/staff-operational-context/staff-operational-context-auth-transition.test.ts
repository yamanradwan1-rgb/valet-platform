import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffOperationalContextResponse } from "@valet/contracts";

import type {
  EmployeeApiClient,
  EmployeeRequestOptions,
} from "../../lib/api/employee-api-client";
import { StaffOperationalContextController } from "./staff-operational-context-controller";

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const makeContext = (
  locationId: string,
  locationName: string,
): StaffOperationalContextResponse => ({
  contexts: [
    {
      membershipId: "11111111-1111-4111-8111-111111111111",
      role: "VALET_EMPLOYEE",
      organization: {
        organizationId: "22222222-2222-4222-8222-222222222222",
        name: "Apex Valet",
      },
      activeShift: {
        shiftId: "33333333-3333-4333-8333-333333333333",
        locationId,
        startedAt: "2026-08-21T18:00:00.000Z",
        status: "ACTIVE",
      },
      currentLocation: {
        locationId,
        name: locationName,
        code: "LOC-01",
      },
      eligibleLocations: [],
    },
  ],
});

describe("StaffOperationalContextController Auth Transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("destroys stored context on logout and prevents late response from restoring it", async () => {
    let resolveContextA: (
      val: StaffOperationalContextResponse,
    ) => void = () => {};
    let capturedSignal: AbortSignal | undefined;

    const mockApiClient = {
      request: vi
        .fn()
        .mockImplementation((_p: string, opts?: EmployeeRequestOptions) => {
          capturedSignal = opts?.signal;
          return new Promise((res) => {
            resolveContextA = res;
          });
        }),
    } as unknown as EmployeeApiClient;

    const controller = new StaffOperationalContextController({
      apiClient: mockApiClient,
    });

    controller.setAuth("authenticated", "token_user_A", 1);
    expect(controller.getState().isLoading).toBe(true);

    // User A logs out before resolution
    controller.setAuth("unauthenticated", null, 2);
    expect(controller.getState().response).toBeNull();
    expect(controller.getState().isLoading).toBe(false);
    expect(capturedSignal?.aborted).toBe(true);

    // Resolve late A response
    resolveContextA(
      makeContext("44444444-4444-4444-8444-444444444444", "Hotel Alpha"),
    );
    await flushAsync();

    // MUST remain destroyed
    expect(controller.getState().response).toBeNull();

    controller.destroy();
  });

  it("same-token reauthentication cannot resurrect old context before fresh fetch", async () => {
    const contextA = makeContext(
      "44444444-4444-4444-8444-444444444444",
      "Hotel Alpha",
    );
    let resolveFresh: (val: StaffOperationalContextResponse) => void = () => {};

    const mockApiClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(contextA)
        .mockImplementationOnce(() => {
          return new Promise((res) => {
            resolveFresh = res;
          });
        }),
    } as unknown as EmployeeApiClient;

    const controller = new StaffOperationalContextController({
      apiClient: mockApiClient,
    });

    // 1. Initial auth loads context under generation 1
    controller.setAuth("authenticated", "token_same_123", 1);
    await flushAsync();
    expect(controller.getState().response).toEqual(contextA);

    // 2. Logout immediately destroys stored context (generation 2)
    controller.setAuth("unauthenticated", null, 2);
    expect(controller.getState().response).toBeNull();

    // 3. Reauthenticate with SAME token value under new generation 3
    controller.setAuth("authenticated", "token_same_123", 3);

    // INVARIANT: Response is strictly null during fetch, NOT resurrected!
    expect(controller.getState().response).toBeNull();
    expect(controller.getState().isLoading).toBe(true);

    // 4. Fresh read completes
    const freshContext = makeContext(
      "55555555-5555-4555-8555-555555555555",
      "Hotel Beta",
    );
    resolveFresh(freshContext);
    await flushAsync();

    expect(controller.getState().response).toEqual(freshContext);

    controller.destroy();
  });

  it("User B login exposes nothing until fresh B fetch succeeds", async () => {
    const contextA = makeContext(
      "44444444-4444-4444-8444-444444444444",
      "Hotel Alpha",
    );
    let resolveContextB: (
      val: StaffOperationalContextResponse,
    ) => void = () => {};

    const mockApiClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(contextA)
        .mockImplementationOnce(() => {
          return new Promise((res) => {
            resolveContextB = res;
          });
        }),
    } as unknown as EmployeeApiClient;

    const controller = new StaffOperationalContextController({
      apiClient: mockApiClient,
    });

    controller.setAuth("authenticated", "token_A", 1);
    await flushAsync();
    expect(controller.getState().response).toEqual(contextA);

    // Switch to User B with generation 2
    controller.setAuth("authenticated", "token_B", 2);

    // Old User A context is destroyed immediately
    expect(controller.getState().response).toBeNull();
    expect(controller.getState().isLoading).toBe(true);

    // Resolve User B
    const contextB = makeContext(
      "55555555-5555-4555-8555-555555555555",
      "Hotel Beta",
    );
    resolveContextB(contextB);
    await flushAsync();

    expect(controller.getState().response).toEqual(contextB);

    controller.destroy();
  });

  it("does not trigger callbacks or state changes after destroy on late resolution", async () => {
    let resolvePending: (
      val: StaffOperationalContextResponse,
    ) => void = () => {};
    const onStateChange = vi.fn();

    const mockApiClient = {
      request: vi.fn().mockImplementation(() => {
        return new Promise((res) => {
          resolvePending = res;
        });
      }),
    } as unknown as EmployeeApiClient;

    const controller = new StaffOperationalContextController({
      apiClient: mockApiClient,
      onStateChange,
    });

    controller.setAuth("authenticated", "token_123", 1);
    onStateChange.mockClear();

    // Destroy controller
    controller.destroy();

    // Late resolution
    resolvePending(
      makeContext("44444444-4444-4444-8444-444444444444", "Hotel Alpha"),
    );
    await flushAsync();

    expect(onStateChange).not.toHaveBeenCalled();
    expect(controller.getState().response).toBeNull();
  });
});
