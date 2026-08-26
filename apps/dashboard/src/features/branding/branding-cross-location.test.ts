import { describe, expect, it } from "vitest";

import type { BrandingSnapshot } from "./branding-controller";

import {
  selectScopedValue,
  stampScope,
} from "../../lib/api/scoped-view";
import {
  flush,
  Harness,
  LOCATION_A,
  LOCATION_B,
  readResponse,
  T1,
  T2,
} from "./branding-controller.test-support";

/**
 * Cross-location visibility for /branding (D5-001 stale-paint elimination).
 *
 * Controller snapshots carry the locationId they were produced for, so the
 * hook selects the render-time view model through that stamp: a settled
 * Location A snapshot collapses to the neutral loading posture as soon as
 * Location B is selected — synchronously, BEFORE the effect that runs
 * load(B). Proven here against the REAL controller.
 */



function neutral(): BrandingSnapshot {
  return {
    conflict: null,
    data: null,
    loadError: null,
    locationId: null,
    mutationError: null,
    pendingMutation: null,
    phase: "loading",
  };
}

function viewUnder(
  snapshot: BrandingSnapshot,
  currentLocation: string | null,
): BrandingSnapshot {
  return selectScopedValue(
    stampScope(snapshot.locationId, snapshot),
    currentLocation,
    neutral(),
  );
}

describe("cross-location visibility: branding", () => {
  it("cannot render Location A branding once the selection is Location B", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    expect(harness.latest.phase).toBe("ready");

    // Steps 2-5: selection becomes B; evaluated BEFORE any effect runs.
    const underB = viewUnder(harness.latest, LOCATION_B);
    expect(underB.phase).toBe("loading");
    expect(underB.data).toBeNull();
    expect(underB.locationId).toBeNull();
    expect(underB.pendingMutation).toBeNull();
    expect(underB.conflict).toBeNull();
  });

  it("load(B) re-stamps synchronously and drops a straggler A fetch", async () => {
    const harness = new Harness();
    harness.controller.load(LOCATION_A);

    // Selection becomes B: the effect runs load(B), which discards A and
    // commits B's loading posture SYNCHRONOUSLY (no await in between).
    harness.controller.load(LOCATION_B);
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.phase).toBe("loading");
    expect(viewUnder(harness.latest, LOCATION_B).phase).toBe("loading");

    // The straggler A response resolves now; the sequence guard drops it.
    const countBefore = harness.snapshots.length;
    harness.loads[0]!.resolve(readResponse(LOCATION_A, T1));
    await flush();
    expect(harness.snapshots.length).toBe(countBefore);
    expect(harness.latest.locationId).toBe(LOCATION_B);
  });

  it("keeps expectedUpdatedAt ownership on the CURRENT location", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_B, T2);
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    expect(harness.sets[0]?.locationId).toBe(LOCATION_B);
    expect(
      (harness.sets[0]?.request as { expectedUpdatedAt: string })
        .expectedUpdatedAt,
    ).toBe(T2);
    harness.sets[0]!.resolve(
      readResponse(LOCATION_B, "2026-08-01T12:00:00.000Z", {
        displayName: {
          effective: "Nova Valet",
          override: "Nova Valet",
          overridePresent: true,
        },
      }),
    );
    await flush();
    expect(harness.latest.data?.displayName.override).toBe("Nova Valet");
  });
});
