import { describe, expect, it } from "vitest";

import { ProductionShellController } from "../src/shell/production-shell-controller";
import { auth, operations } from "./production-shell-test-fixture";

function restore(controller: ProductionShellController, generation: number) {
  controller.update(auth("restoring", generation), operations("inactive"));
  controller.update(
    auth("authenticated", generation),
    operations("loading-context", { generation }),
  );
  return controller.update(
    auth("authenticated", generation),
    operations("ready", { generation }),
  );
}

describe("MOB-023B Native cold-start routing", () => {
  it.each(["parking", "retrieval"] as const)(
    "does not restore Process-A %s navigation into Process B",
    (destination) => {
      let processA: ProductionShellController | undefined =
        new ProductionShellController();
      restore(processA, 1);
      expect(processA.receive({ destination, source: "navigation" })).toBe(
        "resolved",
      );
      expect(
        processA.update(auth("authenticated"), operations("ready")),
      ).toMatchObject({ destination });

      processA = undefined;
      const processB = new ProductionShellController();
      expect(restore(processB, 2)).toMatchObject({
        destination: "tasks",
        kind: "active",
      });
    },
  );

  it("rejects command-screen cold intents after authority restoration", () => {
    const processB = new ProductionShellController();
    expect(processB.receive({ destination: "parking", source: "cold" })).toBe(
      "held",
    );
    expect(restore(processB, 2)).toMatchObject({ destination: "tasks" });
    expect(processB.receive({ destination: "retrieval", source: "cold" })).toBe(
      "rejected",
    );
    expect(
      processB.update(
        auth("authenticated", 2),
        operations("ready", {
          generation: 2,
        }),
      ),
    ).toMatchObject({ destination: "tasks" });
  });
});
