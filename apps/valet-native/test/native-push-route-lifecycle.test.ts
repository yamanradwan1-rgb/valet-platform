import { describe, expect, it, vi } from "vitest";
import { EmployeeOperationalSession } from "@valet/employee-client";

import { NativePushRouteCoordinator } from "../src/notifications/native-push-route-coordinator";
import {
  FakeRouteOperations,
  responseIntent,
  routeAuth,
  routeSnapshot,
} from "./native-push-route-fixture";

function harness() {
  const operations = new FakeRouteOperations();
  const routeTasks = vi.fn(() => "resolved" as const);
  const coordinator = new NativePushRouteCoordinator({
    auth: routeAuth("authenticated"),
    operations,
    routeTasks,
  });
  return { coordinator, operations, routeTasks };
}

describe("native push route canonical lifecycle", () => {
  it("waits for foreground then revalidates context and queue before routing", async () => {
    const { coordinator, operations, routeTasks } = harness();
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({
        count: 1,
        locationId: "77777777-7777-4777-8777-777777777777",
      });
    };
    coordinator.receive(responseIntent());
    expect(routeTasks).not.toHaveBeenCalled();
    coordinator.setForeground(true);
    await coordinator.whenIdle();
    expect(operations.refreshCalls).toBe(1);
    expect(routeTasks).toHaveBeenCalledOnce();
    expect(operations.current().scope?.locationId).toBe(
      "77777777-7777-4777-8777-777777777777",
    );
  });

  it("performs an explicit queue read when context refresh did not fetch", async () => {
    const { coordinator, operations, routeTasks } = harness();
    operations.onRefreshQueue = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();
    expect(operations.refreshCalls).toBe(1);
    expect(operations.refreshQueueCalls).toBe(1);
    expect(routeTasks).toHaveBeenCalledOnce();
  });

  it("uses the canonical refresh path for foreground banner OPEN", async () => {
    const { coordinator, operations, routeTasks } = harness();
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    coordinator.setForeground(true);
    coordinator.requestForegroundOpen();
    await coordinator.whenIdle();
    expect(operations.refreshCalls).toBe(1);
    expect(routeTasks).toHaveBeenCalledOnce();
  });

  it("keeps an offline tap pending until a meaningful recovery retry", async () => {
    const { coordinator, operations, routeTasks } = harness();
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ queueFailure: true });
    };
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();
    expect(routeTasks).not.toHaveBeenCalled();

    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    coordinator.retry();
    coordinator.retry();
    await coordinator.whenIdle();
    expect(routeTasks).toHaveBeenCalledOnce();
    expect(operations.refreshCalls).toBe(2);
  });

  it.each([
    "access-denied",
    "ambiguous-active-shifts",
    "no-active-shift",
    "no-usable-location",
  ] as const)("lets the authoritative %s gate win", async (phase) => {
    const { coordinator, operations, routeTasks } = harness();
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ phase });
    };
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();
    expect(routeTasks).not.toHaveBeenCalled();
    coordinator.retry();
    await coordinator.whenIdle();
    expect(operations.refreshCalls).toBe(1);
  });

  it("treats a stale tap as generic attention and renders only an empty current queue", async () => {
    const { coordinator, operations, routeTasks } = harness();
    const protectedMutations = {
      acceptTask: vi.fn(),
      assignTask: vi.fn(),
      claimTask: vi.fn(),
      startRetrieval: vi.fn(),
    };
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();
    expect(operations.current().tasks).toEqual([]);
    expect(routeTasks).toHaveBeenCalledOnce();
    for (const mutation of Object.values(protectedMutations)) {
      expect(mutation).not.toHaveBeenCalled();
    }
  });

  it("handles distinct out-of-order IDs only as repeated canonical reads", async () => {
    const { coordinator, operations, routeTasks } = harness();
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({
        count: operations.current().successfulQueueSnapshotCount + 1,
      });
    };
    coordinator.setForeground(true);
    coordinator.receive(responseIntent("90000000-0000-4000-8000-000000000009"));
    coordinator.receive(responseIntent("80000000-0000-4000-8000-000000000008"));
    await coordinator.whenIdle();
    expect(operations.refreshCalls).toBe(2);
    expect(routeTasks).toHaveBeenCalledTimes(2);
  });

  it("measures safe outcome classes without exposing intent identifiers", async () => {
    const observations: unknown[] = [];
    const operations = new FakeRouteOperations();
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    let now = 10;
    const coordinator = new NativePushRouteCoordinator({
      auth: routeAuth("authenticated"),
      now: () => (now += 5),
      observe: (observation) => observations.push(observation),
      operations,
      routeTasks: () => "resolved",
    });
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();
    expect(observations).toContainEqual({
      durationMs: 5,
      kind: "canonical-refresh-succeeded",
    });
    expect(JSON.stringify(observations)).not.toContain("10000000");
  });

  it("keeps refresh and navigation correct when an observer fails", async () => {
    const operations = new FakeRouteOperations();
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    const routeTasks = vi.fn(() => "resolved" as const);
    const coordinator = new NativePushRouteCoordinator({
      auth: routeAuth("authenticated"),
      observe: () => {
        throw new Error("synthetic observer failure");
      },
      operations,
      routeTasks,
    });
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();
    expect(routeTasks).toHaveBeenCalledOnce();
  });

  it("uses the current Location B session owner and invokes zero mutations", async () => {
    const locationA = "11111111-1111-4111-8111-111111111111";
    const locationB = "77777777-7777-4777-8777-777777777777";
    const contexts = [context(locationA, "A"), context(locationB, "B")];
    const acceptTask = vi.fn(async () => {
      throw new Error("protected mutation must not run");
    });
    const assignTask = vi.fn(async () => {
      throw new Error("protected mutation must not run");
    });
    const loadTaskQueue = vi.fn(async (locationId: string) => {
      expect(locationId).toHaveLength(36);
      return { tasks: [] };
    });
    const permissionRequest = vi.fn();
    const operations = new EmployeeOperationalSession({
      initialForeground: true,
      transport: {
        acceptTask,
        assignTask,
        loadOperationalContext: vi.fn(async () => contexts.shift()!),
        loadTaskQueue,
      },
    });
    await operations.activate(1);
    const routeTasks = vi.fn(() => "resolved" as const);
    const coordinator = new NativePushRouteCoordinator({
      auth: routeAuth("authenticated"),
      operations,
      routeTasks,
    });
    coordinator.setForeground(true);
    coordinator.receive(responseIntent());
    await coordinator.whenIdle();

    expect(loadTaskQueue.mock.calls.map(([locationId]) => locationId)).toEqual([
      locationA,
      locationB,
    ]);
    expect(operations.current().scope?.locationId).toBe(locationB);
    expect(routeTasks).toHaveBeenCalledOnce();
    expect(acceptTask).not.toHaveBeenCalled();
    expect(assignTask).not.toHaveBeenCalled();
    expect(permissionRequest).not.toHaveBeenCalled();
    operations.dispose();
  });
});

function context(locationId: string, suffix: string) {
  return {
    contexts: [
      {
        activeShift: {
          locationId,
          shiftId: `40000000-0000-4000-8000-00000000000${suffix === "A" ? "1" : "2"}`,
          startedAt: "2026-09-11T12:00:00.000Z",
          status: "ACTIVE" as const,
        },
        currentLocation: {
          code: `LOC-${suffix}`,
          currency: "JOD",
          locationId,
          name: `Location ${suffix}`,
        },
        eligibleLocations: [
          {
            code: `LOC-${suffix}`,
            currency: "JOD",
            locationId,
            name: `Location ${suffix}`,
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
