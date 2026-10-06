import { describe, expect, it } from "vitest";

import type { SelectedDashboardScope } from "../scope";
import {
  advanceSelectedScopeState,
  advanceSelectedScopeStateIfCurrentEpoch,
  initialSelectedScopeState,
  settleSelectedScopeRestorationIfCurrentEpoch,
  type SelectedScopeEpoch,
} from "./selected-scope-state";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const locationA = {
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "A",
  code: "A",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};
const locationB = {
  ...locationA,
  locationId: "33333333-3333-4333-8333-333333333333",
  name: "B",
  code: "B",
};
const scopeA: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER",
  organization,
  location: locationA,
};
const scopeB: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER",
  organization,
  location: locationB,
};

function epoch(
  identityGeneration = 1,
  sessionGeneration = 4,
  selectionRevision = 0,
): SelectedScopeEpoch {
  return { identityGeneration, sessionGeneration, selectionRevision };
}

describe("selected scope restoration lifecycle fencing", () => {
  it("starts in checking state and settles unselected when no hint exists", () => {
    const initial = initialSelectedScopeState(1);
    expect(initial).toMatchObject({
      persistence: "preserve",
      restorationStatus: "checking",
      selectedScope: null,
      selectionRevision: 0,
    });
    expect(settleSelectedScopeRestorationIfCurrentEpoch(
      initial,
      { identityGeneration: 1, sessionGeneration: 4 },
      epoch(),
      null,
      "sync",
    )).toMatchObject({
      persistence: "sync",
      restorationStatus: "settled",
      selectedScope: null,
      selectionRevision: 1,
    });
  });

  it("publishes a validated restored scope exactly once", () => {
    const initial = initialSelectedScopeState(1);
    const restored = settleSelectedScopeRestorationIfCurrentEpoch(
      initial,
      { identityGeneration: 1, sessionGeneration: 4 },
      epoch(),
      scopeA,
      "sync",
    );
    expect(restored.selectedScope).toBe(scopeA);
    expect(restored.selectionRevision).toBe(1);
    expect(settleSelectedScopeRestorationIfCurrentEpoch(
      restored,
      { identityGeneration: 1, sessionGeneration: 4 },
      epoch(),
      scopeA,
      "sync",
    )).toBe(restored);
  });

  it("ignores delayed restoration after identity replacement or logout", () => {
    const initial = initialSelectedScopeState(1);
    expect(settleSelectedScopeRestorationIfCurrentEpoch(
      initial,
      { identityGeneration: 2, sessionGeneration: 5 },
      epoch(),
      scopeA,
      "sync",
    )).toBe(initial);
    expect(settleSelectedScopeRestorationIfCurrentEpoch(
      initial,
      { identityGeneration: 2, sessionGeneration: 5 },
      epoch(),
      null,
      "sync",
    )).toBe(initial);
  });

  it("ignores delayed restoration after same-identity sessionGeneration advances", () => {
    const initial = initialSelectedScopeState(1);
    expect(settleSelectedScopeRestorationIfCurrentEpoch(
      initial,
      { identityGeneration: 1, sessionGeneration: 5 },
      epoch(),
      scopeA,
      "sync",
    )).toBe(initial);
  });

  it("cannot overwrite a manual/current B selection with delayed restored A", () => {
    const initial = initialSelectedScopeState(1);
    const selectedB = advanceSelectedScopeState(initial, 1, scopeB);
    const lateA = settleSelectedScopeRestorationIfCurrentEpoch(
      selectedB,
      { identityGeneration: 1, sessionGeneration: 4 },
      epoch(),
      scopeA,
      "sync",
    );
    expect(lateA).toBe(selectedB);
    expect(lateA.selectedScope).toBe(scopeB);
  });

  it("A to B to fresh A keeps the first A epoch from overwriting current A", () => {
    const initial = initialSelectedScopeState(1);
    const firstA = advanceSelectedScopeState(initial, 1, scopeA);
    const selectedB = advanceSelectedScopeState(firstA, 1, scopeB);
    const freshA = advanceSelectedScopeState(selectedB, 1, scopeA);
    const oldAEpoch = epoch(1, 4, firstA.selectionRevision);
    const result = advanceSelectedScopeStateIfCurrentEpoch(
      freshA,
      { identityGeneration: 1, sessionGeneration: 4 },
      oldAEpoch,
      null,
    );
    expect(result).toBe(freshA);
    expect(result.selectedScope).toBe(scopeA);
    expect(result.selectionRevision).toBe(3);
  });

  it("a stale clearScopeIfEpoch denial cannot clear current B or its persistence owner", () => {
    const initial = initialSelectedScopeState(1);
    const selectedA = advanceSelectedScopeState(initial, 1, scopeA);
    const selectedB = advanceSelectedScopeState(selectedA, 1, scopeB);
    const result = advanceSelectedScopeStateIfCurrentEpoch(
      selectedB,
      { identityGeneration: 1, sessionGeneration: 4 },
      epoch(1, 4, selectedA.selectionRevision),
      null,
    );
    expect(result).toBe(selectedB);
    expect(result).toMatchObject({
      persistence: "sync",
      restorationStatus: "settled",
      selectedScope: scopeB,
    });
  });

  it("transient failure can settle safely while preserving the existing hint for a later reload", () => {
    const initial = initialSelectedScopeState(1);
    expect(settleSelectedScopeRestorationIfCurrentEpoch(
      initial,
      { identityGeneration: 1, sessionGeneration: 4 },
      epoch(),
      null,
      "preserve",
    )).toMatchObject({
      persistence: "preserve",
      restorationStatus: "settled",
      selectedScope: null,
    });
  });
});
