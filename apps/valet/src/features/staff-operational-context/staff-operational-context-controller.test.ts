import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffOperationalContextResponse } from "@valet/contracts";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
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
        currency: "JOD",
        locationId,
        name: locationName,
        code: "LOC-01",
        timezone: "Asia/Amman",
      },
      eligibleLocations: [],
    },
  ],
});

describe("StaffOperationalContextController Refresh & Invalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("retains valid context during transient 500 error on refresh", async () => {
    const validContext = makeContext(
      "44444444-4444-4444-8444-444444444444",
      "Grand Hotel",
    );

    const mockApiClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(validContext)
        .mockRejectedValueOnce(
          new EmployeeApiError({
            status: 500,
            code: "SERVER_ERROR",
            message: "Temporary outage",
          }),
        ),
    } as unknown as EmployeeApiClient;

    const controller = new StaffOperationalContextController({
      apiClient: mockApiClient,
    });

    controller.setAuth("authenticated", "token_123", 1);
    await flushAsync();
    expect(controller.getState().response).toEqual(validContext);

    // Refresh fails with 500
    await controller.refresh();
    await flushAsync();

    // Prior valid context is retained, error is surfaced
    expect(controller.getState().response).toEqual(validContext);
    expect(controller.getState().error).not.toBeNull();
    expect(controller.getState().isLoading).toBe(false);

    controller.destroy();
  });

  it("clears stored context immediately on 401, 403, and 404 errors", async () => {
    for (const status of [401, 403, 404]) {
      const validContext = makeContext(
        "44444444-4444-4444-8444-444444444444",
        "Grand Hotel",
      );

      const mockApiClient = {
        request: vi
          .fn()
          .mockResolvedValueOnce(validContext)
          .mockRejectedValueOnce(
            new EmployeeApiError({
              status,
              code: "FORBIDDEN",
              message: "Scope revoked",
            }),
          ),
      } as unknown as EmployeeApiClient;

      const controller = new StaffOperationalContextController({
        apiClient: mockApiClient,
      });

      controller.setAuth("authenticated", "token_123", 1);
      await flushAsync();
      expect(controller.getState().response).toEqual(validContext);

      // Refresh encounters auth/scope revocation error
      await controller.refresh();
      await flushAsync();

      // INVARIANT: Response is cleared to null
      expect(controller.getState().response).toBeNull();
      expect(controller.getState().error).not.toBeNull();

      controller.destroy();
    }
  });

  it("authorization-loss revalidation clears stored context BEFORE network request", async () => {
    const validContext = makeContext(
      "44444444-4444-4444-8444-444444444444",
      "Grand Hotel",
    );
    let resolveRevalidation: (
      val: StaffOperationalContextResponse,
    ) => void = () => {};

    const mockApiClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(validContext)
        .mockImplementationOnce(() => {
          return new Promise((res) => {
            resolveRevalidation = res;
          });
        }),
    } as unknown as EmployeeApiClient;

    const controller = new StaffOperationalContextController({
      apiClient: mockApiClient,
    });

    controller.setAuth("authenticated", "token_123", 1);
    await flushAsync();
    expect(controller.getState().response).toEqual(validContext);

    // Call revalidateOnAuthLoss
    const revalPromise = controller.revalidateOnAuthLoss();

    // INVARIANT: Context is immediately cleared BEFORE resolution!
    expect(controller.getState().response).toBeNull();
    expect(controller.getState().isLoading).toBe(true);

    const freshContext = makeContext(
      "55555555-5555-4555-8555-555555555555",
      "Hotel Beta",
    );
    resolveRevalidation(freshContext);
    await revalPromise;

    expect(controller.getState().response).toEqual(freshContext);

    controller.destroy();
  });

  it("stale normal refresh cannot overwrite or beat auth-loss invalidation", async () => {
    const validContext = makeContext(
      "44444444-4444-4444-8444-444444444444",
      "Grand Hotel",
    );
    let resolveRefresh: (
      val: StaffOperationalContextResponse,
    ) => void = () => {};

    const mockApiClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(validContext)
        .mockImplementationOnce(() => {
          return new Promise((res) => {
            resolveRefresh = res;
          });
        })
        .mockRejectedValueOnce(
          new EmployeeApiError({
            status: 403,
            code: "FORBIDDEN",
            message: "Session expired",
          }),
        ),
    } as unknown as EmployeeApiClient;

    const controller = new StaffOperationalContextController({
      apiClient: mockApiClient,
    });

    controller.setAuth("authenticated", "token_123", 1);
    await flushAsync();

    // Start a normal refresh that stalls
    void controller.refresh();

    // In the meantime, auth loss revalidation triggers
    const revalPromise = controller.revalidateOnAuthLoss();
    expect(controller.getState().response).toBeNull();

    // Stale refresh completes late
    resolveRefresh(validContext);
    await flushAsync();

    // Wait for auth loss revalidation to finish (and fail with 403)
    await revalPromise;
    await flushAsync();

    // INVARIANT: Late refresh was discarded; state is null
    expect(controller.getState().response).toBeNull();

    controller.destroy();
  });
});
