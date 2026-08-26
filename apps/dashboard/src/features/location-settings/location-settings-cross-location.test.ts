import { describe, expect, it } from "vitest";

import type { ConfigurationSnapshot } from "./configuration-controller";

import {
  selectScopedValue,
  stampScope,
} from "../../lib/api/scoped-view";
import {
  configuration,
  flush,
  Harness,
  LOCATION_A,
  LOCATION_B,
  mutationResponse,
  T1,
  T2,
} from "./configuration-controller.test-support";

/**
 * Cross-location visibility for /location-settings (D5-001 stale-paint
 * elimination). Controller snapshots carry their owning locationId, so the
 * hook selects the render-time view model through that stamp: a settled
 * Location A settings envelope (including its fee strings, currency and
 * timezone) collapses to the neutral loading posture as soon as Location B
 * is selected — synchronously, BEFORE the effect that runs load(B).
 */

function neutral(): ConfigurationSnapshot {
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
  snapshot: ConfigurationSnapshot,
  currentLocation: string | null,
): ConfigurationSnapshot {
  return selectScopedValue(
    stampScope(snapshot.locationId, snapshot),
    currentLocation,
    neutral(),
  );
}

describe("cross-location visibility: location-settings", () => {
  it("cannot render Location A settings once the selection is Location B", async () => {
    const harness = new Harness();
    harness.controller.load(LOCATION_A);
    harness.loads[0]!.resolve(configuration(LOCATION_A, T1));
    await flush();
    expect(harness.latest.phase).toBe("ready");
    const fee = harness.latest.data?.settings.find(
      (setting) => setting.setting === "valetServiceFee",
    );
    expect(fee?.effective).toBe("0.000");

    // Steps 2-5: selection becomes B; evaluated BEFORE any effect runs.
    // A's currency, timezone, fee strings and override state are all gone.
    const underB = viewUnder(harness.latest, LOCATION_B);
    expect(underB.phase).toBe("loading");
    expect(underB.data).toBeNull();
    expect(underB.pendingMutation).toBeNull();
    expect(underB.conflict).toBeNull();
  });

  it("load(B) re-stamps synchronously and drops a straggler A fetch", async () => {
    const harness = new Harness();
    harness.controller.load(LOCATION_A);

    // Selection becomes B: load(B) discards A synchronously.
    harness.controller.load(LOCATION_B);
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.data).toBeNull();

    // The straggler A response resolves now; the sequence guard drops it.
    const countBefore = harness.snapshots.length;
    harness.loads[0]!.resolve(configuration(LOCATION_A, T1));
    await flush();
    expect(harness.snapshots.length).toBe(countBefore);
    expect(harness.latest.locationId).toBe(LOCATION_B);
  });

  it("keeps expectedUpdatedAt ownership on the CURRENT location", async () => {
    const harness = new Harness();
    harness.controller.load(LOCATION_B);
    harness.loads[0]!.resolve(configuration(LOCATION_B, T2));
    await flush();

    harness.controller.setOverride({ setting: "tipsEnabled", value: false });
    expect(harness.sets[0]?.locationId).toBe(LOCATION_B);
    expect(
      (harness.sets[0]?.request as { expectedUpdatedAt: string })
        .expectedUpdatedAt,
    ).toBe(T2);

    harness.sets[0]!.resolve(
      mutationResponse("2026-08-01T12:00:00.000Z", "tipsEnabled", LOCATION_B),
    );
    await flush();
    const tipsEnabled = harness.latest.data?.settings.find(
      (setting) => setting.setting === "tipsEnabled",
    );
    expect(tipsEnabled?.overridePresent).toBe(true);
    expect(tipsEnabled?.override).toBe(false);
  });
});
