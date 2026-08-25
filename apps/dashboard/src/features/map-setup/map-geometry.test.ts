import { describe, expect, it } from "vitest";

import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import {
  areaPurposeColor,
  buildAreaPolygons,
  buildPointMarkers,
  formatVertexList,
  MAX_VERTICES,
  mapSetupStats,
  MIN_VERTICES,
  orderVertices,
  parseCoordinate,
  parseVertexList,
  pointKindColor,
} from "./map-geometry";

function point(overrides: Partial<LocationMapPoint> = {}): LocationMapPoint {
  return {
    active: true,
    code: "ENT_MAIN",
    createdAt: "2026-08-20T09:00:00+03:00",
    id: "11111111-2222-4333-8444-555555555555",
    kind: "ENTRANCE",
    label: "Main Entrance",
    latitude: 32.562703,
    levelLabel: null,
    longitude: 35.880055,
    updatedAt: "2026-08-20T09:00:00+03:00",
    ...overrides,
  };
}

function area(overrides: Partial<LocationMapArea> = {}): LocationMapArea {
  return {
    active: true,
    code: "PARK_A",
    createdAt: "2026-08-20T09:10:00+03:00",
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    label: "Parking Area A",
    levelLabel: null,
    parkingZoneId: null,
    purpose: "PARKING",
    updatedAt: "2026-08-20T09:10:00+03:00",
    vertices: [
      { latitude: 32.5625, longitude: 35.88, position: 0 },
      { latitude: 32.5628, longitude: 35.8805, position: 1 },
      { latitude: 32.5623, longitude: 35.8807, position: 2 },
    ],
    ...overrides,
  };
}

describe("coordinate parsing", () => {
  it("parses decimals exactly without rounding", () => {
    expect(parseCoordinate("32.562703", "latitude")).toBe(32.562703);
    expect(parseCoordinate(" 35.880055 ", "longitude")).toBe(35.880055);
    expect(parseCoordinate("-90", "latitude")).toBe(-90);
    expect(parseCoordinate("180", "longitude")).toBe(180);
  });

  it("rejects empty, non-numeric and out-of-range input", () => {
    expect(parseCoordinate("", "latitude")).toBeNull();
    expect(parseCoordinate("   ", "longitude")).toBeNull();
    expect(parseCoordinate("abc", "latitude")).toBeNull();
    expect(parseCoordinate("12x", "latitude")).toBeNull();
    expect(parseCoordinate("90.000001", "latitude")).toBeNull();
    expect(parseCoordinate("-180.1", "longitude")).toBeNull();
    expect(parseCoordinate("181", "longitude")).toBeNull();
  });
});

describe("vertex list parsing", () => {
  it("preserves the typed order verbatim", () => {
    const parsed = parseVertexList(
      "32.5623,35.8807\n32.5625,35.88\n32.5628,35.8805",
    );
    expect(parsed).toEqual([
      { latitude: 32.5623, longitude: 35.8807 },
      { latitude: 32.5625, longitude: 35.88 },
      { latitude: 32.5628, longitude: 35.8805 },
    ]);
  });

  it("rejects malformed lines instead of guessing", () => {
    expect(parseVertexList("32.5,35.8\nbad line")).toBeNull();
    expect(parseVertexList("32.5,35.8,extra\n32.5,35.8")).toBeNull();
    expect(parseVertexList("95,35.8\n32.5,35.8")).toBeNull();
    expect(parseVertexList("")).toEqual([]);
  });

  it("formats back to an exact round-trippable text", () => {
    const text = "32.562703,35.880055\n32.5625,35.88";
    expect(formatVertexList(parseVertexList(text) ?? [])).toBe(text);
  });

  it("keeps the documented contract bounds as constants", () => {
    expect(MIN_VERTICES).toBe(3);
    expect(MAX_VERTICES).toBe(500);
  });
});

describe("provider-neutral definitions", () => {
  it("maps points to markers with exact coordinates and kind colors", () => {
    const markers = buildPointMarkers(
      [
        point(),
        point({
          id: "22222222-2222-4333-8444-555555555555",
          kind: "PICKUP",
          code: "PICK_A",
        }),
        point({
          id: "33333333-2222-4333-8444-555555555555",
          kind: "DROP_OFF",
          code: "DROP_A",
        }),
      ],
      null,
    );
    expect(markers[0]).toMatchObject({
      color: pointKindColor("ENTRANCE"),
      id: "11111111-2222-4333-8444-555555555555",
      latitude: 32.562703,
      longitude: 35.880055,
      selected: false,
    });
    expect(pointKindColor("PICKUP")).not.toBe(pointKindColor("ENTRANCE"));
    expect(pointKindColor("DROP_OFF")).not.toBe(pointKindColor("PICKUP"));
  });

  it("marks the selected marker", () => {
    const [marker] = buildPointMarkers([point()], point().id);
    expect(marker?.selected).toBe(true);
  });

  it("orders polygon vertices by authoritative position", () => {
    const shuffled = area({
      vertices: [
        { latitude: 32.5623, longitude: 35.8807, position: 2 },
        { latitude: 32.5625, longitude: 35.88, position: 0 },
        { latitude: 32.5628, longitude: 35.8805, position: 1 },
      ],
    });
    expect(orderVertices(shuffled.vertices)).toEqual([
      { latitude: 32.5625, longitude: 35.88 },
      { latitude: 32.5628, longitude: 35.8805 },
      { latitude: 32.5623, longitude: 35.8807 },
    ]);
  });

  it("maps areas to polygons without adding an implicit closing vertex", () => {
    const polygons = buildAreaPolygons([area()], null);
    expect(polygons).toHaveLength(1);
    const polygon = polygons[0];
    expect(polygon?.vertices).toHaveLength(3);
    expect(polygon?.vertices[0]).not.toEqual(polygon?.vertices[2]);
    // Stored data is passed through untouched; closure is render-only.
    expect(area().vertices).toHaveLength(3);
    expect(areaPurposeColor("RESTRICTED")).not.toBe(
      areaPurposeColor("PARKING"),
    );
  });

  it("flags the selected polygon only", () => {
    const other = area({ id: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
    const polygons = buildAreaPolygons([area(), other], area().id);
    expect(polygons[0]?.selected).toBe(true);
    expect(polygons[1]?.selected).toBe(false);
  });
});

describe("setup stats", () => {
  it("counts totals and active entries honestly", () => {
    const stats = mapSetupStats(
      [
        point(),
        point({ id: "44444444-2222-4333-8444-555555555555", active: false }),
      ],
      [area(), area({ active: false })],
    );
    expect(stats).toEqual({
      activeAreas: 1,
      activePoints: 1,
      areasTotal: 2,
      pointsTotal: 2,
    });
  });

  it("reports zeros for an unconfigured location", () => {
    expect(mapSetupStats([], [])).toEqual({
      activeAreas: 0,
      activePoints: 0,
      areasTotal: 0,
      pointsTotal: 0,
    });
  });
});
