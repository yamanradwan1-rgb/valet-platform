import { describe, expect, it } from "vitest";

import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import {
  buildAreaPatch,
  buildPointPatch,
  mergeMutationIntoSettled,
  type MutationResult,
  type SettledLoad,
} from "./map-setup-state";

const LOCATION_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const LOCATION_B = "bbbbbbbb-0000-4000-8000-00000000000b";

function settledReady(options: {
  attempt: number;
  locationId: string;
}): SettledLoad {
  return {
    attempt: options.attempt,
    locationId: options.locationId,
    outcome: {
      data: {
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
      },
      phase: "ready",
    },
  };
}

describe("changed-fields-only PATCH safety", () => {
  const point: LocationMapPoint = {
    active: true,
    code: "ENT_MAIN",
    createdAt: "2026-08-20T09:00:00+03:00",
    id: "11111111-0000-4000-8000-000000000001",
    kind: "ENTRANCE",
    label: "Main Entrance",
    latitude: 32.562703,
    levelLabel: null,
    longitude: 35.880055,
    updatedAt: "2026-08-20T09:00:00+03:00",
  };

  const area: LocationMapArea = {
    active: true,
    code: "PARK_A",
    createdAt: "2026-08-20T09:10:00+03:00",
    id: "aaaaaaaa-0000-4000-8000-00000000000a2",
    label: "Parking A",
    levelLabel: null,
    parkingZoneId: "cccccccc-0000-4000-8000-000000000ccc",
    purpose: "PARKING",
    updatedAt: "2026-08-20T09:10:00+03:00",
    vertices: [
      { latitude: 1, longitude: 2, position: 0 },
      { latitude: 3, longitude: 4, position: 1 },
      { latitude: 5, longitude: 6, position: 2 },
    ],
  };

  it("renaming a point sends ONLY the label", () => {
    const patch = buildPointPatch(point, {
      active: point.active,
      code: point.code,
      kind: point.kind,
      label: "Renamed Entrance",
      latitude: point.latitude,
      levelLabel: point.levelLabel,
      longitude: point.longitude,
    });
    expect(Object.keys(patch)).toEqual(["label"]);
  });

  it("changing active never rewrites coordinates or metadata", () => {
    const patch = buildPointPatch(point, {
      active: false,
      code: point.code,
      kind: point.kind,
      label: point.label,
      latitude: point.latitude,
      levelLabel: point.levelLabel,
      longitude: point.longitude,
    });
    expect(patch).toEqual({ active: false });
  });

  it("clearing an optional value explicitly sends null", () => {
    const withLevel = { ...point, levelLabel: "Ground" };
    const patch = buildPointPatch(withLevel, {
      active: true,
      code: withLevel.code,
      kind: withLevel.kind,
      label: withLevel.label,
      latitude: withLevel.latitude,
      levelLabel: null,
      longitude: withLevel.longitude,
    });
    expect(patch).toEqual({ levelLabel: null });
  });

  it("an untouched form yields an empty patch that cannot be submitted", () => {
    const patch = buildPointPatch(point, {
      active: point.active,
      code: point.code,
      kind: point.kind,
      label: point.label,
      latitude: point.latitude,
      levelLabel: point.levelLabel,
      longitude: point.longitude,
    });
    expect(patch).toEqual({});
  });

  it("editing an unrelated area field preserves parkingZoneId verbatim", () => {
    const patch = buildAreaPatch(area, {
      active: area.active,
      code: area.code,
      label: "Overflow A",
      levelLabel: area.levelLabel,
      parkingZoneId: area.parkingZoneId,
      purpose: area.purpose,
    });
    expect(Object.keys(patch)).toEqual(["label"]);
    expect(JSON.stringify(patch)).not.toContain("parkingZoneId");
  });

  it("area patches are structurally incapable of touching vertices", () => {
    const patch = buildAreaPatch(area, {
      active: !area.active,
      code: "NEW_CODE",
      label: "New",
      levelLabel: "B1",
      parkingZoneId: area.parkingZoneId,
      purpose: "OVERFLOW",
    });
    expect(patch).toEqual({
      active: false,
      code: "NEW_CODE",
      label: "New",
      levelLabel: "B1",
      purpose: "OVERFLOW",
    });
  });
});

describe("mutation completing after a location switch", () => {
  const settledB = settledReady({ attempt: 4, locationId: LOCATION_B });

  function pointResult(): MutationResult {
    return {
      entity: {
        active: true,
        code: "FROM_LOCATION_A",
        createdAt: "2026-08-20T10:00:00+03:00",
        id: "55555555-0000-4000-8000-000000000005",
        kind: "PICKUP",
        label: "Late Location A point",
        latitude: 31.9,
        levelLabel: null,
        longitude: 35.9,
        updatedAt: "2026-08-20T10:00:00+03:00",
      },
      kind: "point",
    };
  }

  it("never merges a Location A mutation response into Location B state", () => {
    const merged = mergeMutationIntoSettled(
      settledB,
      LOCATION_A,
      pointResult(),
    );
    // Identity guard rejects the merge outright.
    expect(merged).toBe(settledB);
    if (settledB.outcome.phase === "ready") {
      expect(
        settledB.outcome.data.points.some(
          (entry) => entry.code === "FROM_LOCATION_A",
        ),
      ).toBe(false);
    }
  });

  it("merges into matching-location data only", () => {
    const merged = mergeMutationIntoSettled(
      settledReady({ attempt: 4, locationId: LOCATION_A }),
      LOCATION_A,
      pointResult(),
    );
    if (merged?.outcome.phase !== "ready") throw new Error("expected ready");
    expect(merged.outcome.data.points).toHaveLength(1);
    expect(merged.outcome.data.points[0]?.code).toBe("FROM_LOCATION_A");
  });
});
