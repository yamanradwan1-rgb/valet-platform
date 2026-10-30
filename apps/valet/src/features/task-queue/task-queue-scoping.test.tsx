import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StaffTaskQueueItem, TaskQueueResponse } from "@valet/contracts";

import { useTaskQueue, type UseTaskQueueResult } from "./use-task-queue";
import { TaskQueueController } from "./task-queue-controller";
import { selectEffectiveTaskQueueItems } from "./task-queue-selectors";
import { StaffAuthClient } from "../../lib/auth/staff-auth-client";
import { StaffAuthProvider } from "../../lib/auth/staff-auth-context";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

describe("Task Queue SSR Gating & Controller Scope Denial", () => {
  const createAuthClient = (authenticated = true) => {
    const client = new StaffAuthClient();
    if (authenticated) {
      vi.spyOn(client, "getSession").mockReturnValue({
        accessToken: "vsa1_test_token",
        tokenType: "Bearer",
        accessExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        sessionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    } else {
      vi.spyOn(client, "getSession").mockReturnValue(null);
    }
    vi.spyOn(client, "tryRefresh").mockResolvedValue(null);
    return client;
  };

  it("never exposes tasks when rendered unauthenticated", () => {
    const unauthClient = createAuthClient(false);
    let capturedResult: UseTaskQueueResult | null = null;

    function Harness() {
      capturedResult = useTaskQueue({
        locationId: "loc-A",
      });
      return <div>{capturedResult.tasks.length}</div>;
    }

    const html = renderToStaticMarkup(
      <StaffAuthProvider client={unauthClient}>
        <Harness />
      </StaffAuthProvider>,
    );

    expect(html).toContain("0");
    expect(capturedResult as UseTaskQueueResult | null).not.toBeNull();
    expect((capturedResult as unknown as UseTaskQueueResult).tasks).toEqual([]);
  });

  it("renders an empty initial queue on SSR when locationId is null", () => {
    const authClient = createAuthClient(true);
    let capturedResult: UseTaskQueueResult | null = null;

    function Harness() {
      capturedResult = useTaskQueue({
        locationId: null,
      });
      return <div>{capturedResult.tasks.length}</div>;
    }

    renderToStaticMarkup(
      <StaffAuthProvider client={authClient}>
        <Harness />
      </StaffAuthProvider>,
    );

    expect(capturedResult as UseTaskQueueResult | null).not.toBeNull();
    expect((capturedResult as unknown as UseTaskQueueResult).tasks).toEqual([]);
  });

  it("hides previously loaded scoped tasks and hard-stops after a 403", async () => {
    const onAuthLoss = vi.fn();
    const protectedTask: StaffTaskQueueItem = {
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
    const mockApiClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          tasks: [protectedTask],
        } satisfies TaskQueueResponse)
        .mockRejectedValueOnce(
          new EmployeeApiError({
            status: 403,
            code: "FORBIDDEN",
            message: "Forbidden location",
          }),
        ),
    } as unknown as EmployeeApiClient;
    const controller = new TaskQueueController({
      apiClient: mockApiClient,
      pollingIntervalMs: 30000,
      onAuthorizationLoss: onAuthLoss,
    });
    try {
      controller.setScope("authenticated", 1, "loc-forbidden");
      await vi.waitFor(() =>
        expect(controller.getState().tasks).toHaveLength(1),
      );
      await Promise.resolve();
      expect(
        selectEffectiveTaskQueueItems(
          "authenticated",
          1,
          "loc-forbidden",
          controller.getState(),
        ),
      ).toEqual([protectedTask]);

      await controller.executePoll(false, 1, "loc-forbidden");
      expect(controller.getState().tasks).toEqual([]);
      expect(controller.getState().isHardStopped).toBe(true);
      expect(
        selectEffectiveTaskQueueItems(
          "authenticated",
          1,
          "loc-forbidden",
          controller.getState(),
        ),
      ).toEqual([]);
      expect(onAuthLoss).toHaveBeenCalledTimes(1);

      controller.handleVisibilityChange(true);
      controller.handleOnline();
      await controller.executePoll(false, 1, "loc-forbidden");
      expect(mockApiClient.request).toHaveBeenCalledTimes(2);
      expect(mockApiClient.request).toHaveBeenNthCalledWith(
        2,
        "/v1/staff/tasks/queue",
        expect.objectContaining({
          params: { locationId: "loc-forbidden" },
          requireAuth: true,
        }),
      );
    } finally {
      controller.destroy();
    }
  });
});
