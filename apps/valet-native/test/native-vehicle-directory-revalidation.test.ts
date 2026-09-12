import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Native Vehicles lifecycle revalidation", () => {
  it("uses the shared subscribed lifecycle owner without a timer or AppState owner", () => {
    const hook = readFileSync(
      new URL(
        "../src/vehicles/use-native-vehicle-directory-revalidation.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const lifecycle = readFileSync(
      new URL(
        "../src/shell/native-production-lifecycle-owner.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(hook).not.toMatch(/setTimeout|AppState|schedule/u);
    expect(lifecycle).toContain("runtime.vehicleDirectory.refresh()");
    expect(lifecycle).toContain(
      "runtime.vehicleDirectory.suspendForBackground()",
    );
  });
});
