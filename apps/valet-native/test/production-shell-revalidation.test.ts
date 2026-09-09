import { describe, expect, it } from "vitest";

import { ProductionShellController } from "../src/shell/production-shell-controller";
import { auth, operations, scope } from "./production-shell-test-fixture";

function ready(
  controller: ProductionShellController,
  activeScope = scope,
  generation = 1,
) {
  return controller.update(
    auth("authenticated", generation),
    operations("ready", {
      generation,
      retainedScope: activeScope,
    }),
  );
}

function openCheckIn(controller: ProductionShellController) {
  ready(controller);
  controller.receive({ destination: "check-in", source: "navigation" });
  expect(ready(controller)).toMatchObject({ destination: "check-in" });
}

describe("production shell same-authority revalidation", () => {
  it("preserves Tasks across same-scope loading and readiness", () => {
    const controller = new ProductionShellController();
    expect(ready(controller)).toMatchObject({ destination: "tasks" });

    expect(
      controller.update(
        auth("authenticated"),
        operations("loading-context", { retainedScope: scope }),
      ),
    ).toEqual({ kind: "context-loading" });

    expect(ready(controller)).toMatchObject({ destination: "tasks" });
    expect(controller.currentWorkflowPurgeRevision()).toBe(0);
  });

  it("hides but preserves check-in across same-scope loading", () => {
    const controller = new ProductionShellController();
    openCheckIn(controller);

    expect(
      controller.update(
        auth("authenticated"),
        operations("loading-context", { retainedScope: scope }),
      ),
    ).toEqual({ kind: "context-loading" });
    expect(controller.back()).toBe(false);

    expect(ready(controller)).toMatchObject({ destination: "check-in" });
    expect(controller.currentWorkflowPurgeRevision()).toBe(0);
  });

  it("keeps temporary context error and retry gated before safe resume", () => {
    const controller = new ProductionShellController();
    openCheckIn(controller);

    expect(
      controller.update(auth("authenticated"), operations("error")),
    ).toEqual({
      kind: "operational-error",
      message: null,
      reason: "unavailable",
    });
    expect(
      controller.update(
        auth("authenticated"),
        operations("loading-context", { retainedScope: null }),
      ),
    ).toEqual({ kind: "context-loading" });

    expect(ready(controller)).toMatchObject({ destination: "check-in" });
    expect(controller.currentWorkflowPurgeRevision()).toBe(0);
  });

  it.each([
    [
      "Location",
      { ...scope, locationId: "55555555-5555-4555-8555-555555555555" },
    ],
    ["Shift", { ...scope, shiftId: "66666666-6666-4666-8666-666666666666" }],
    ["role", { ...scope, role: "VALET_SUPERVISOR" as const }],
  ])("purges check-in when %s authority changes", (_label, nextScope) => {
    const controller = new ProductionShellController();
    openCheckIn(controller);
    controller.update(
      auth("authenticated"),
      operations("loading-context", { retainedScope: scope }),
    );

    expect(ready(controller, nextScope)).toMatchObject({
      destination: "tasks",
    });
    expect(controller.currentWorkflowPurgeRevision()).toBe(1);
  });

  it("purges check-in across an auth generation/account change", () => {
    const controller = new ProductionShellController();
    openCheckIn(controller);

    expect(
      controller.update(
        auth("authenticated", 2),
        operations("ready", { generation: 1, retainedScope: scope }),
      ),
    ).toEqual({ kind: "context-loading" });
    expect(ready(controller, scope, 2)).toMatchObject({ destination: "tasks" });
    expect(controller.currentWorkflowPurgeRevision()).toBe(1);
  });

  it.each(["unauthenticated", "restoring"] as const)(
    "purges check-in when auth becomes %s",
    (phase) => {
      const controller = new ProductionShellController();
      openCheckIn(controller);

      controller.update(auth(phase), operations("inactive"));

      expect(controller.currentWorkflowPurgeRevision()).toBe(1);
      expect(ready(controller, scope, 2)).toMatchObject({
        destination: "tasks",
      });
    },
  );

  it.each(["access-denied", "no-usable-location", "no-active-shift"] as const)(
    "purges check-in for authoritative %s",
    (phase) => {
      const controller = new ProductionShellController();
      openCheckIn(controller);

      controller.update(auth("authenticated"), operations(phase));

      expect(controller.currentWorkflowPurgeRevision()).toBe(1);
      expect(ready(controller)).toMatchObject({ destination: "tasks" });
    },
  );

  it("does not let a stale earlier-generation response revive check-in", () => {
    const controller = new ProductionShellController();
    openCheckIn(controller);
    controller.update(auth("unauthenticated", 2), operations("inactive"));
    ready(controller, scope, 2);

    expect(
      controller.update(
        auth("authenticated", 2),
        operations("ready", { generation: 1, retainedScope: scope }),
      ),
    ).toEqual({ kind: "context-loading" });
    expect(ready(controller, scope, 2)).toMatchObject({ destination: "tasks" });
  });

  it("does not let a stale earlier generation purge current check-in", () => {
    const controller = new ProductionShellController();
    ready(controller, scope, 2);
    controller.receive({ destination: "check-in", source: "navigation" });
    expect(ready(controller, scope, 2)).toMatchObject({
      destination: "check-in",
    });

    expect(
      controller.update(
        auth("authenticated", 2),
        operations("ready", { generation: 1, retainedScope: scope }),
      ),
    ).toEqual({ kind: "context-loading" });

    expect(controller.currentWorkflowPurgeRevision()).toBe(0);
    expect(ready(controller, scope, 2)).toMatchObject({
      destination: "check-in",
    });
  });
});
