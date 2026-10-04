import { describe, expect, it, vi } from "vitest";
import {
  EmployeeApiError,
  EmployeeOperationalSession,
} from "@valet/employee-client";

import { NativePushRouteCoordinator } from "../src/notifications/native-push-route-coordinator";
import {
  FakeRouteOperations,
  responseIntent,
  routeAuth,
  routeSnapshot,
} from "./native-push-route-fixture";

describe("native push route denial and observations", () => {
  it("consumes a real context AUTHORIZATION_DENIED tap permanently", async () => {
    let contextResult: "denied" | "healthy" = "healthy";
    const acceptTask = vi.fn();
    const assignTask = vi.fn();
    const loadOperationalContext = vi.fn(async () => {
      if (contextResult === "denied") {
        throw new EmployeeApiError({
          code: "AUTHORIZATION_DENIED",
          message: "Current Staff authority is unavailable.",
          status: 404,
        });
      }
      return operationalContext();
    });
    const operations = new EmployeeOperationalSession({
      initialForeground: true,
      transport: {
        acceptTask,
        assignTask,
        loadOperationalContext,
        loadTaskQueue: vi.fn(async () => ({ tasks: [] })),
      },
    });
    await operations.activate(1);
    contextResult = "denied";
    const routeTasks = vi.fn(() => "resolved" as const);
    const observations: string[] = [];
    const coordinator = new NativePushRouteCoordinator({
      auth: routeAuth("authenticated"),
      observe: ({ kind }) => observations.push(kind),
      operations,
      routeTasks,
    });
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();

    expect(operations.current()).toMatchObject({
      contextFailure: { code: "AUTHORIZATION_DENIED" },
      identityGeneration: 1,
      phase: "error",
    });
    expect(observations[0]).toBe("route-held");
    expect(observations).toContain("route-dropped");
    expect(routeTasks).not.toHaveBeenCalled();
    expect(loadOperationalContext).toHaveBeenCalledTimes(2);

    contextResult = "healthy";
    coordinator.retry();
    await coordinator.whenIdle();
    expect(loadOperationalContext).toHaveBeenCalledTimes(2);
    expect(routeTasks).not.toHaveBeenCalled();
    expect(acceptTask).not.toHaveBeenCalled();
    expect(assignTask).not.toHaveBeenCalled();
    operations.dispose();
  });

  it("keeps a context NETWORK_ERROR pending for healthy recovery", async () => {
    const operations = new FakeRouteOperations();
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ phase: "error" });
    };
    const routeTasks = vi.fn(() => "resolved" as const);
    const coordinator = new NativePushRouteCoordinator({
      auth: routeAuth("authenticated"),
      operations,
      routeTasks,
    });
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();
    expect(operations.current().contextFailure?.code).toBe("NETWORK_ERROR");
    expect(routeTasks).not.toHaveBeenCalled();

    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    coordinator.retry();
    await coordinator.whenIdle();
    expect(operations.refreshCalls).toBe(2);
    expect(routeTasks).toHaveBeenCalledOnce();
  });

  it.each([
    ["held", "route-held"],
    ["rejected", "route-dropped"],
    ["resolved", "route-resolved"],
  ] as const)(
    "observes a %s route receipt as %s",
    async (receipt, expected) => {
      const observations: string[] = [];
      const operations = new FakeRouteOperations();
      operations.onRefresh = () => {
        operations.currentSnapshot = routeSnapshot({ count: 1 });
      };
      const coordinator = new NativePushRouteCoordinator({
        auth: routeAuth("authenticated"),
        observe: ({ kind }) => observations.push(kind),
        operations,
        routeTasks: () => receipt,
      });
      coordinator.setForeground(true);
      coordinator.receive(responseIntent());
      await coordinator.whenIdle();
      expect(observations.at(-1)).toBe(expected);
    },
  );
});

function operationalContext() {
  const locationId = "70000000-0000-4000-8000-000000000007";
  return {
    contexts: [
      {
        activeShift: {
          locationId,
          shiftId: "40000000-0000-4000-8000-000000000004",
          startedAt: "2026-09-11T12:00:00.000Z",
          status: "ACTIVE" as const,
        },
        currentLocation: {
          code: "LOC-CURRENT",
          currency: "JOD",
          timezone: "Asia/Amman",
          locationId,
          name: "Current Location",
        },
        eligibleLocations: [
          {
            code: "LOC-CURRENT",
            currency: "JOD",
            timezone: "Asia/Amman",
            locationId,
            name: "Current Location",
          },
        ],
        membershipId: "20000000-0000-4000-8000-000000000002",
        organization: {
          name: "VAYLET Operator",
          organizationId: "30000000-0000-4000-8000-000000000003",
        },
        role: "VALET_EMPLOYEE" as const,
      },
    ],
  };
}
