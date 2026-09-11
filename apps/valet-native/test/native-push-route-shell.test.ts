import { describe, expect, it } from "vitest";

import { NativePushRouteCoordinator } from "../src/notifications/native-push-route-coordinator";
import { ProductionShellController } from "../src/shell/production-shell-controller";
import {
  FakeRouteOperations,
  responseIntent,
  routeAuth,
  routeSnapshot,
} from "./native-push-route-fixture";

describe("native push response shell integration", () => {
  it("moves a background workflow to Tasks only after current canonical truth", async () => {
    const auth = routeAuth("authenticated");
    const operations = new FakeRouteOperations();
    const controller = new ProductionShellController();
    controller.update(auth, operations.current());
    controller.receive({ destination: "parking", source: "navigation" });
    expect(controller.update(auth, operations.current())).toMatchObject({
      destination: "parking",
    });

    operations.onRefresh = () => {
      operations.currentSnapshot = routeSnapshot({
        count: 1,
        locationId: "70000000-0000-4000-8000-000000000007",
      });
    };
    const coordinator = new NativePushRouteCoordinator({
      auth,
      operations,
      routeTasks: () => {
        controller.update(auth, operations.current());
        return controller.receive({
          destination: "tasks",
          source: "notification",
        });
      },
    });

    coordinator.setForeground(false);
    coordinator.receive(responseIntent());
    expect(operations.refreshCalls).toBe(0);
    coordinator.setForeground(true);
    await coordinator.whenIdle();

    expect(operations.refreshCalls).toBe(1);
    expect(controller.update(auth, operations.current())).toMatchObject({
      destination: "tasks",
      scope: {
        locationId: "70000000-0000-4000-8000-000000000007",
      },
    });
  });
});
