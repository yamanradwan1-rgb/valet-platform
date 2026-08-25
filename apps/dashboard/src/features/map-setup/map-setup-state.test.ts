import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import type { MapSetupData } from "./map-setup-api";
import {
  beginMutation,
  selectSetupLoadState,
  setupFailureMessageKey,
  upsertArea,
  upsertPoint,
  type SettledLoad,
} from "./map-setup-state";

const LOCATION_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const LOCATION_B = "bbbbbbbb-0000-4000-8000-00000000000b";

function readyData(): MapSetupData {
  return {
    areas: [
      {
        active: true,
        code: "PARK_B",
        createdAt: "2026-08-20T09:10:00+03:00",
        id: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        label: "Location B area",
        levelLabel: null,
        parkingZoneId: null,
        purpose: "PARKING",
        updatedAt: "2026-08-20T09:10:00+03:00",
        vertices: [
          { latitude: 1, longitude: 2, position: 0 },
          { latitude: 3, longitude: 4, position: 1 },
          { latitude: 5, longitude: 6, position: 2 },
        ],
      },
    ],
    points: [],
  };
}

function settledReady(options: {
  attempt: number;
  locationId: string;
}): SettledLoad {
  return {
    attempt: options.attempt,
    locationId: options.locationId,
    outcome: { data: readyData(), phase: "ready" },
  };
}

describe("stale-response protection", () => {
  it("renders a settled result only while attempt and location match", () => {
    const state = selectSetupLoadState(settledReady({ attempt: 1, locationId: LOCATION_A }), LOCATION_A, 1);
    expect(state.phase).toBe("ready");
  });

  it("collapses to loading when a newer attempt exists", () => {
    const state = selectSetupLoadState(settledReady({ attempt: 0, locationId: LOCATION_A }), LOCATION_A, 1);
    expect(state.phase).toBe("loading");
  });

  it("a slow Location A response can never replace Location B data", () => {
    // Location A's response arrived late; the current request is Location B.
    const staleA = settledReady({ attempt: 3, locationId: LOCATION_A });
    const state = selectSetupLoadState(staleA, LOCATION_B, 3);
    expect(state.phase).toBe("loading");
    if (state.phase === "ready") {
      throw new Error("stale location data leaked into the new location");
    }
  });

  it("keeps an unset location on loading even with stale state", () => {
    const stale = settledReady({ attempt: 1, locationId: LOCATION_A });
    expect(selectSetupLoadState(stale, "", 1).phase).toBe("loading");
  });

  it("surfaces the preserved error only for the matching identities", () => {
    const error = new DashboardApiError({
      code: "AUTHORIZATION_DENIED",
      kind: "authorization-masked",
      message: "masked",
      status: 404,
    });
    const settled: SettledLoad = {
      attempt: 2,
      locationId: LOCATION_B,
      outcome: { error, phase: "error" },
    };
    expect(selectSetupLoadState(settled, LOCATION_B, 2)).toEqual({
      error,
      phase: "error",
    });
    expect(selectSetupLoadState(settled, LOCATION_A, 2).phase).toBe("loading");
  });
});

describe("duplicate-submission guard", () => {
  it("starts when no mutation is pending and blocks otherwise", () => {
    expect(beginMutation(null)).toBe("started");
    expect(beginMutation("point.create")).toBe("blocked");
    expect(beginMutation("area.vertices")).toBe("blocked");
  });
});

describe("authoritative reconciliation upserts", () => {
  const existing = {
    active: true,
    code: "ENT_MAIN",
    createdAt: "2026-08-20T09:00:00+03:00",
    id: "11111111-0000-4000-8000-000000000001",
    kind: "ENTRANCE" as const,
    label: "Main Entrance",
    latitude: 32.562703,
    levelLabel: null,
    longitude: 35.880055,
    updatedAt: "2026-08-20T09:00:00+03:00",
  };

  it("replaces by id in place and appends unknown ids at the end", () => {
    const updated = { ...existing, label: "Renamed" };
    const next = upsertPoint([existing], updated);
    expect(next).toHaveLength(1);
    expect(next[0]?.label).toBe("Renamed");

    const added = upsertPoint(
      [existing],
      { ...existing, id: "22222222-0000-4000-8000-000000000002", code: "PICK_A" },
    );
    expect(added.map((point) => point.code)).toEqual(["ENT_MAIN", "PICK_A"]);
  });

  it("upserts areas without reordering others", () => {
    const first = {
      active: true,
      code: "PARK_A",
      createdAt: "2026-08-20T09:10:00+03:00",
      id: "33333333-0000-4000-8000-000000000003",
      label: "Parking A",
      levelLabel: null,
      parkingZoneId: null,
      purpose: "PARKING" as const,
      updatedAt: "2026-08-20T09:10:00+03:00",
      vertices: [],
    };
    const second = { ...first, id: "44444444-0000-4000-8000-000000000004", code: "PARK_B" };
    const replaced = upsertArea(
      [first, second],
      { ...second, label: "Overflow B", purpose: "OVERFLOW" as const },
    );
    expect(replaced.map((area) => area.code)).toEqual(["PARK_A", "PARK_B"]);
    expect(replaced[1]?.purpose).toBe("OVERFLOW");
  });
});

describe("failure message mapping", () => {
  function failure(kind: DashboardApiError["kind"]): DashboardApiError {
    return new DashboardApiError({
      code: kind.toUpperCase(),
      kind,
      message: kind,
      status: 0,
    });
  }

  it("maps masked authorization failures to the friendly denied posture", () => {
    expect(setupFailureMessageKey(failure("authorization-masked"))).toBe(
      "errors.accessDenied",
    );
    expect(setupFailureMessageKey(failure("forbidden"))).toBe(
      "errors.accessDenied",
    );
  });

  it("maps conflicts to the map-setup conflict explanation", () => {
    expect(setupFailureMessageKey(failure("conflict"))).toBe(
      "mapSetup.errors.conflict",
    );
  });

  it("maps expiry, rate limiting, network and generic failures honestly", () => {
    expect(setupFailureMessageKey(failure("session-expired"))).toBe(
      "errors.sessionExpired",
    );
    expect(setupFailureMessageKey(failure("rate-limited"))).toBe(
      "errors.rateLimited",
    );
    const network = new DashboardApiError({
      code: "NETWORK_ERROR",
      isNetworkError: true,
      kind: "server",
      message: "network",
      status: 0,
    });
    expect(setupFailureMessageKey(network)).toBe("states.networkError");
    expect(setupFailureMessageKey(failure("server"))).toBe(
      "mapSetup.errors.actionFailed",
    );
    expect(setupFailureMessageKey(new Error("boom"))).toBe(
      "errors.requestFailed",
    );
  });
});
