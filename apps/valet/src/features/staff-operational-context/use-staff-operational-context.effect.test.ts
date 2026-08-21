import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffOperationalContextResponse } from "@valet/contracts";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type {
  EmployeeApiClient,
  EmployeeRequestOptions,
} from "../../lib/api/employee-api-client";
import { useStaffOperationalContext } from "./use-staff-operational-context";
import * as authContextModule from "../../lib/auth/staff-auth-context";
import { renderHookWithEffects } from "../../test/hook-effect-runner";
import type { StaffAuthClient } from "../../lib/auth/staff-auth-client";

const flushAsync = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("useStaffOperationalContext Effect & Auth Race Lifecycle", () => {
  const makeContextResponse = (
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

  const setupAuth = (
    status: "authenticated" | "unauthenticated",
    token: string | null = null,
  ) => {
    vi.spyOn(authContextModule, "useOptionalStaffAuth").mockReturnValue({
      status,
      session:
        status === "authenticated" && token
          ? {
              accessToken: token,
              tokenType: "Bearer",
              accessExpiresAt: "2026-08-21T19:00:00.000Z",
              sessionExpiresAt: "2026-08-22T18:00:00.000Z",
            }
          : null,
      client: {} as StaffAuthClient,
      login: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });
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

  it("User A context is cleared on logout and cannot leak to User B", async () => {
    // User A authenticated
    setupAuth("authenticated", "token_user_A");

    const contextA = makeContextResponse(
      "44444444-4444-4444-8444-444444444444",
      "Hotel Alpha",
    );
    const contextB = makeContextResponse(
      "55555555-5555-4555-8555-555555555555",
      "Hotel Beta",
    );

    let resolveContextB: (
      val: StaffOperationalContextResponse,
    ) => void = () => {};

    const mockRequest = vi
      .fn()
      .mockImplementation((_path: string, opts?: EmployeeRequestOptions) => {
        const signal = opts?.signal;
        if (signal?.aborted) {
          return Promise.reject(new Error("Aborted"));
        }
        return Promise.resolve(contextA);
      });

    const mockClient = {
      request: mockRequest,
    } as unknown as EmployeeApiClient;

    const harness = renderHookWithEffects(
      () => useStaffOperationalContext(mockClient),
      undefined,
    );

    await flushAsync();
    harness.rerender();

    expect(harness.current.resolution.kind).toBe("RESOLVED");
    if (harness.current.resolution.kind === "RESOLVED") {
      expect(harness.current.resolution.scope.locationName).toBe("Hotel Alpha");
    }

    // User A logs out (unauthenticated)
    setupAuth("unauthenticated", null);
    harness.rerender();

    // Invariant: Stored context is immediately cleared
    expect(harness.current.resolution.kind).toBe("NO_ACTIVE_SHIFT");
    expect(harness.current.response).toBeNull();

    // User B logs in
    mockRequest.mockImplementation(
      (_path: string, opts?: EmployeeRequestOptions) => {
        const signal = opts?.signal;
        if (signal?.aborted) {
          return Promise.reject(new Error("Aborted"));
        }
        return new Promise((res) => {
          resolveContextB = res;
        });
      },
    );

    setupAuth("authenticated", "token_user_B");
    harness.rerender();

    // BEFORE B resolves, old User A context is NOT exposed!
    expect(harness.current.resolution.kind).toBe("NO_ACTIVE_SHIFT");
    expect(harness.current.response).toBeNull();

    // Resolve User B
    resolveContextB(contextB);
    await flushAsync();
    harness.rerender();

    // ONLY User B scope is exposed
    expect(harness.current.resolution.kind).toBe("RESOLVED");
    if (harness.current.resolution.kind === "RESOLVED") {
      expect(harness.current.resolution.scope.locationName).toBe("Hotel Beta");
      expect(harness.current.resolution.scope.locationId).toBe(
        "55555555-5555-4555-8555-555555555555",
      );
    }

    harness.unmount();
  });

  it("retains prior valid context during transient 500 error on refresh", async () => {
    setupAuth("authenticated", "token_123");

    const validContext = makeContextResponse(
      "44444444-4444-4444-8444-444444444444",
      "Grand Hotel",
    );

    const mockRequest = vi.fn().mockResolvedValue(validContext);
    const mockClient = {
      request: mockRequest,
    } as unknown as EmployeeApiClient;

    const harness = renderHookWithEffects(
      () => useStaffOperationalContext(mockClient),
      undefined,
    );

    await flushAsync();
    harness.rerender();

    expect(harness.current.resolution.kind).toBe("RESOLVED");

    // Next refresh fails with transient 500 server error
    mockRequest.mockRejectedValue(
      new EmployeeApiError({
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Database transient outage",
      }),
    );

    await harness.current.refresh();
    await flushAsync();
    harness.rerender();

    // Invariant: prior valid scope is RETAINED, error is exposed separately
    expect(harness.current.resolution.kind).toBe("RESOLVED");
    if (harness.current.resolution.kind === "RESOLVED") {
      expect(harness.current.resolution.scope.locationName).toBe("Grand Hotel");
    }
    expect(harness.current.error).not.toBeNull();

    harness.unmount();
  });

  it("authorization-loss revalidation invalidates context immediately", async () => {
    setupAuth("authenticated", "token_123");

    const validContext = makeContextResponse(
      "44444444-4444-4444-8444-444444444444",
      "Grand Hotel",
    );

    let resolveRevalidation: (
      val: Promise<StaffOperationalContextResponse>,
    ) => void = () => {};
    const mockRequest = vi.fn().mockResolvedValueOnce(validContext);

    const mockClient = {
      request: mockRequest,
    } as unknown as EmployeeApiClient;

    const harness = renderHookWithEffects(
      () => useStaffOperationalContext(mockClient),
      undefined,
    );

    await flushAsync();
    harness.rerender();
    expect(harness.current.resolution.kind).toBe("RESOLVED");

    // Trigger authorization loss revalidation
    mockRequest.mockImplementation(() => {
      return new Promise((res) => {
        resolveRevalidation = res;
      });
    });

    const revalPromise = harness.current.revalidateOnAuthLoss();
    harness.rerender();

    // Invariant: Immediately invalidated before fetch finishes!
    expect(harness.current.resolution.kind).toBe("NO_ACTIVE_SHIFT");
    expect(harness.current.response).toBeNull();

    // If revalidation fails with 403 Forbidden
    resolveRevalidation(
      Promise.reject(
        new EmployeeApiError({
          status: 403,
          code: "FORBIDDEN",
          message: "Scope revoked",
        }),
      ),
    );

    await revalPromise;
    await flushAsync();
    harness.rerender();

    // Invariant: Remains NO_ACTIVE_SHIFT, never restores old scope
    expect(harness.current.resolution.kind).toBe("NO_ACTIVE_SHIFT");

    harness.unmount();
  });
});
