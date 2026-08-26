import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import type { OverviewComposition } from "./overview-api";
import { selectOverviewLoadState } from "./use-overview-data";

/**
 * D4 integration regression guard for the Overview load selector.
 *
 * Settled Overview results are stamped with BOTH the attempt nonce and the
 * requested location id. Any identity mismatch must collapse to `loading`,
 * so a slow Location A response can never render under Location B while
 * B's own fetch is in flight (the same invariant Map Setup already pins via
 * selectSetupLoadState).
 */

const LOCATION_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const LOCATION_B = "bbbbbbbb-0000-4000-8000-00000000000b";

function readyComposition(): OverviewComposition {
  return {
    financial: { currencies: [] },
    queue: { depth: 0, oldestAgeSeconds: null },
    stateCounts: { counts: [] },
  };
}

describe("selectOverviewLoadState", () => {
  it("renders loading when nothing has settled yet", () => {
    expect(selectOverviewLoadState(null, LOCATION_A, 0)).toEqual({
      phase: "loading",
    });
  });

  it("keeps a settled payload only under its exact identity", () => {
    const settled = {
      attempt: 0,
      locationId: LOCATION_A,
      outcome: { data: readyComposition(), phase: "ready" } as const,
    };
    const state = selectOverviewLoadState(settled, LOCATION_A, 0);
    expect(state).toEqual({ data: settled.outcome.data, phase: "ready" });
  });

  it("collapses to loading under a different location (A→B switch)", () => {
    // Location A finished; the operator switched to Location B and B is
    // still in flight. A's KPIs/queue/financial totals must NOT render.
    const settledA = {
      attempt: 0,
      locationId: LOCATION_A,
      outcome: { data: readyComposition(), phase: "ready" } as const,
    };
    expect(selectOverviewLoadState(settledA, LOCATION_B, 0)).toEqual({
      phase: "loading",
    });
  });

  it("collapses to loading after an explicit reload bumps the attempt", () => {
    const settledStale = {
      attempt: 0,
      locationId: LOCATION_A,
      outcome: { data: readyComposition(), phase: "ready" } as const,
    };
    expect(selectOverviewLoadState(settledStale, LOCATION_A, 1)).toEqual({
      phase: "loading",
    });
  });

  it("collapses to loading when the gate has no location selected", () => {
    const settledA = {
      attempt: 0,
      locationId: LOCATION_A,
      outcome: { data: readyComposition(), phase: "ready" } as const,
    };
    expect(selectOverviewLoadState(settledA, "", 0)).toEqual({
      phase: "loading",
    });
  });

  it("keeps a settled error only under its exact identity", () => {
    const error = new DashboardApiError({
      code: "OVERVIEW_UNEXPECTED_ERROR",
      kind: "server",
      message: "boom",
      status: 500,
    });
    const settled = {
      attempt: 2,
      locationId: LOCATION_B,
      outcome: { error, phase: "error" } as const,
    };
    expect(selectOverviewLoadState(settled, LOCATION_B, 2)).toEqual({
      error,
      phase: "error",
    });
    expect(selectOverviewLoadState(settled, LOCATION_A, 2)).toEqual({
      phase: "loading",
    });
  });
});
