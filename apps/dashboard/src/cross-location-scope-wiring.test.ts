import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Placement guard for the D5-001 cross-location stale-paint correction.
 *
 * SECONDARY evidence only: the behavioral proof lives in the executable
 * suites (scoped-view.test.ts, cursor-list-cross-location.test.ts,
 * overview-lists-cross-location.test.ts, live-operations /
 * financial-overview / branding / location-settings cross-location tests).
 * This file pins that every effect-driven location-owned hook actually
 * routes its exposed view model through the shared scope selector, so a
 * future refactor cannot silently drop the collapse from one surface.
 */

const HOOKS_USING_STAMPS: string[] = [
  "./lib/api/use-cursor-list.ts",
  "./features/dashboard-overview/use-overview-cursor-list.ts",
  "./features/live-operations/use-live-operations.ts",
  "./features/financial-overview/use-financial-overview.ts",
];

const HOOKS_USING_SNAPSHOT_STAMPS: string[] = [
  "./features/branding/use-branding.ts",
  "./features/location-settings/use-location-configuration.ts",
];

function sourceOf(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("cross-location scope selector wiring", () => {
  it("routes every stamped hook through the shared selector", () => {
    for (const file of [...HOOKS_USING_STAMPS, ...HOOKS_USING_SNAPSHOT_STAMPS]) {
      expect(sourceOf(file).includes("selectScopedValue"), file).toBe(true);
    }
  });

  it("keeps request-time stamping in the four state-writing hooks", () => {
    for (const file of HOOKS_USING_STAMPS) {
      expect(sourceOf(file).includes("stampScope("), file).toBe(true);
    }
  });
});
