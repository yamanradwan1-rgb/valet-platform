import { describe, expect, it, vi } from "vitest";

import { NativePushRouteCoordinator } from "../src/notifications/native-push-route-coordinator";
import { deferred } from "./native-push-fixture";
import {
  FakeRouteOperations,
  responseIntent,
  routeAuth,
  routeSnapshot,
} from "./native-push-route-fixture";

function create(authPhase: "authenticated" | "restoring" | "unauthenticated") {
  const operations = new FakeRouteOperations();
  operations.currentSnapshot = routeSnapshot({
    generation: null,
    phase: "inactive",
  });
  const routeTasks = vi.fn(() => "resolved" as const);
  const coordinator = new NativePushRouteCoordinator({
    auth: routeAuth(authPhase),
    operations,
    routeTasks,
  });
  coordinator.setForeground(true);
  return { coordinator, operations, routeTasks };
}

describe("native push route auth-generation fencing", () => {
  it("holds a true cold-start response through restore and uses current authority", async () => {
    const { coordinator, operations, routeTasks } = create("restoring");
    coordinator.receive(responseIntent());
    expect(operations.refreshCalls).toBe(0);
    operations.currentSnapshot = routeSnapshot({ generation: 1 });
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1, generation: 1 });
    };
    coordinator.setAuth(routeAuth("authenticated", 1));
    await coordinator.whenIdle();
    expect(routeTasks).toHaveBeenCalledOnce();
  });

  it("holds an unbound signed-out response until a later login", async () => {
    const { coordinator, operations, routeTasks } = create("unauthenticated");
    coordinator.receive(responseIntent());
    coordinator.purgeIdentityScoped();
    expect(routeTasks).not.toHaveBeenCalled();
    operations.currentSnapshot = routeSnapshot({ generation: 3 });
    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({ count: 1, generation: 3 });
    };
    coordinator.setAuth(routeAuth("authenticated", 3));
    await coordinator.whenIdle();
    expect(routeTasks).toHaveBeenCalledOnce();
  });

  it("drops generation A when logout and B occur before A refresh completes", async () => {
    const { coordinator, operations, routeTasks } = create("authenticated");
    const refresh = deferred<void>();
    operations.currentSnapshot = routeSnapshot({ generation: 1 });
    operations.onRefresh = () => refresh.promise;
    coordinator.receive(responseIntent());
    await Promise.resolve();
    coordinator.setAuth(routeAuth("unauthenticated", 2));
    coordinator.purgeIdentityScoped();
    coordinator.setAuth(routeAuth("authenticated", 3));
    operations.currentSnapshot = routeSnapshot({ count: 1, generation: 3 });
    refresh.resolve();
    await coordinator.whenIdle();
    expect(routeTasks).not.toHaveBeenCalled();
  });

  it("does not route while restoration fails definitively", async () => {
    const { coordinator, operations, routeTasks } = create("restoring");
    coordinator.receive(responseIntent());
    coordinator.setAuth(routeAuth("unauthenticated", 1));
    coordinator.purgeIdentityScoped();
    await coordinator.whenIdle();
    expect(operations.refreshCalls).toBe(0);
    expect(routeTasks).not.toHaveBeenCalled();
  });

  it("invalidates in-flight identity-scoped work on explicit purge", async () => {
    const { coordinator, operations, routeTasks } = create("authenticated");
    const refresh = deferred<void>();
    operations.currentSnapshot = routeSnapshot({ generation: 1 });
    operations.onRefresh = () => refresh.promise;
    coordinator.receive(responseIntent());
    await Promise.resolve();
    coordinator.purgeIdentityScoped();
    operations.currentSnapshot = routeSnapshot({ count: 1, generation: 1 });
    refresh.resolve();
    await coordinator.whenIdle();
    expect(routeTasks).not.toHaveBeenCalled();
  });
});
