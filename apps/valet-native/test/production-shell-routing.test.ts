import { describe, expect, it } from "vitest";

import {
  parseProductionRouteIntent,
  ProductionShellController,
  productionRouteIntentFromParam,
} from "../src/shell/production-shell-controller";
import { auth, operations, scope } from "./production-shell-test-fixture";

function active(
  controller: ProductionShellController,
  generation = 1,
  activeScope = scope,
) {
  return controller.update(
    auth("authenticated", generation),
    operations("ready", {
      generation,
      retainedScope: activeScope,
    }),
  );
}

describe("production route intent and authority fencing", () => {
  it("holds a cold check-in intent before authentication", () => {
    const controller = new ProductionShellController();
    controller.update(auth("restoring"), operations("inactive"));
    expect(
      controller.receive({ destination: "check-in", source: "cold" }),
    ).toBe("held");
    expect(active(controller)).toMatchObject({
      destination: "check-in",
      kind: "active",
    });
  });

  it("holds a cold intent until operational context is ready", () => {
    const controller = new ProductionShellController();
    controller.update(auth("authenticated"), operations("loading-context"));
    expect(
      controller.receive({ destination: "check-in", source: "cold" }),
    ).toBe("held");
    expect(active(controller)).toMatchObject({ destination: "check-in" });
  });

  it("rejects malformed, extra-payload, and secret-shaped intents", () => {
    expect(parseProductionRouteIntent(null)).toBeNull();
    expect(
      parseProductionRouteIntent({
        destination: "development-poc",
        source: "cold",
      }),
    ).toBeNull();
    expect(
      parseProductionRouteIntent({
        accessToken: "must-not-route",
        destination: "tasks",
        source: "cold",
      }),
    ).toBeNull();
  });

  it("accepts only neutral scalar cold-route parameters", () => {
    expect(productionRouteIntentFromParam("check-in")).toEqual({
      destination: "check-in",
      source: "cold",
    });
    expect(productionRouteIntentFromParam(["check-in"])).toBeNull();
    expect(productionRouteIntentFromParam("development-poc")).toBeNull();
  });

  it("resolves Vehicles navigation without allowing a cold Vehicles route", () => {
    const controller = new ProductionShellController();
    expect(
      controller.receive({ destination: "vehicles", source: "cold" }),
    ).toBe("held");
    expect(active(controller)).toMatchObject({ destination: "tasks" });
    expect(
      controller.receive({ destination: "vehicles", source: "navigation" }),
    ).toBe("resolved");
    expect(active(controller)).toMatchObject({ destination: "vehicles" });
  });

  it("keeps unavailable Scan rejected without activating a false route", () => {
    const controller = new ProductionShellController();
    active(controller);
    expect(
      controller.receive({ destination: "scan", source: "navigation" }),
    ).toBe("rejected");
    expect(active(controller)).toMatchObject({ destination: "tasks" });
  });

  it("treats scanner input as a neutral intent, never authority", () => {
    const controller = new ProductionShellController();
    expect(controller.receive({ destination: "scan", source: "scan" })).toBe(
      "held",
    );
    expect(active(controller)).toMatchObject({ destination: "tasks" });
  });

  it("keeps existing intake reachable in a valid active scope", () => {
    const controller = new ProductionShellController();
    active(controller);
    expect(
      controller.receive({ destination: "check-in", source: "navigation" }),
    ).toBe("resolved");
    expect(active(controller)).toMatchObject({ destination: "check-in" });
  });

  it("opens Parking only as an authority-bound in-app workflow", () => {
    const controller = new ProductionShellController();
    expect(controller.receive({ destination: "parking", source: "cold" })).toBe(
      "held",
    );
    expect(active(controller)).toMatchObject({ destination: "tasks" });
    expect(
      controller.receive({ destination: "parking", source: "navigation" }),
    ).toBe("resolved");
    expect(active(controller)).toMatchObject({ destination: "parking" });
    expect(controller.back()).toBe(true);
  });

  it("opens Retrieval only as an authority-bound in-app workflow", () => {
    const controller = new ProductionShellController();
    expect(
      controller.receive({ destination: "retrieval", source: "cold" }),
    ).toBe("held");
    expect(active(controller)).toMatchObject({ destination: "tasks" });
    expect(
      controller.receive({ destination: "retrieval", source: "scan" }),
    ).toBe("rejected");
    expect(active(controller)).toMatchObject({ destination: "tasks" });
    expect(
      controller.receive({ destination: "retrieval", source: "navigation" }),
    ).toBe("resolved");
    expect(active(controller)).toMatchObject({ destination: "retrieval" });
    expect(controller.back()).toBe(true);
    expect(active(controller)).toMatchObject({ destination: "tasks" });
  });

  it("resolves the bounded active Shift destination without enabling summary behavior", () => {
    const controller = new ProductionShellController();
    active(controller);
    expect(
      controller.receive({ destination: "shift", source: "navigation" }),
    ).toBe("resolved");
    expect(active(controller)).toMatchObject({ destination: "shift" });
  });

  it("purges the protected route synchronously on logout", () => {
    const controller = new ProductionShellController();
    active(controller);
    controller.receive({ destination: "check-in", source: "navigation" });
    expect(
      controller.update(auth("unauthenticated", 2), operations("inactive")),
    ).toEqual({
      kind: "logged-out",
    });
    expect(active(controller, 2)).toMatchObject({ destination: "tasks" });
  });

  it("rejects an old-account intent when User B becomes active", () => {
    const controller = new ProductionShellController();
    active(controller, 1);
    controller.update(auth("unauthenticated", 2), operations("inactive"));
    expect(
      controller.receive({ destination: "check-in", source: "cold" }),
    ).toBe("held");
    expect(active(controller, 2)).toMatchObject({ destination: "tasks" });
  });

  it("purges old workflow and intent across a Location scope switch", () => {
    const controller = new ProductionShellController();
    active(controller);
    controller.receive({ destination: "check-in", source: "navigation" });
    controller.update(
      auth("authenticated"),
      operations("loading-context", { retainedScope: scope }),
    );
    controller.receive({ destination: "check-in", source: "navigation" });
    const nextScope = {
      ...scope,
      locationId: "55555555-5555-4555-8555-555555555555",
    };
    expect(active(controller, 1, nextScope)).toMatchObject({
      destination: "tasks",
    });
  });

  it("ignores stale operational state from an earlier generation", () => {
    const controller = new ProductionShellController();
    active(controller, 1);
    controller.update(
      auth("authenticated", 2),
      operations("ready", { generation: 1 }),
    );
    expect(active(controller, 2)).toMatchObject({
      destination: "tasks",
      scope,
    });
  });

  it("uses hardware Back intent only for an active nested route", () => {
    const controller = new ProductionShellController();
    active(controller);
    expect(controller.back()).toBe(false);
    controller.receive({ destination: "check-in", source: "navigation" });
    expect(controller.back()).toBe(true);
    expect(controller.back()).toBe(false);
    expect(active(controller)).toMatchObject({ destination: "tasks" });
  });

  it("does not accumulate stale routes through repeated transitions", () => {
    const controller = new ProductionShellController();
    for (let generation = 1; generation <= 5; generation += 1) {
      active(controller, generation);
      controller.receive({ destination: "check-in", source: "navigation" });
      controller.update(auth("restoring", generation + 1), operations("ready"));
      expect(active(controller, generation + 1)).toMatchObject({
        destination: "tasks",
      });
    }
  });
});
