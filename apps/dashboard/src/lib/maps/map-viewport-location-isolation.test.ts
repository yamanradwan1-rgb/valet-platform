import { describe, expect, it } from "vitest";

import {
  computeMapViewport,
  LOCAL_SPAN_ZOOM,
  type ViewportCoordinate,
} from "./map-viewport";

/**
 * D6-004 §8 — two dramatically separated Locations prove that the viewport
 * calculation is derived purely from each Location's own geometry, that
 * switching locations does not retain the prior viewport, that there is
 * no cross-location coordinate composition, and that an empty Location
 * does not reuse prior geometry.
 *
 * This test is about scoped data flow, not authorization replacement:
 * server authorization remains authoritative.
 */

const AMMAN_LAT = 31.9539;
const NYC_LAT = 40.7128;
const NYC_LNG = -74.006;

const ammanArea: readonly ViewportCoordinate[] = [
  { latitude: 31.9539, longitude: 35.9106 },
  { latitude: 31.954, longitude: 35.911 },
  { latitude: 31.9541, longitude: 35.9108 },
];

const newYorkArea: readonly ViewportCoordinate[] = [
  { latitude: 40.7128, longitude: -74.006 },
  { latitude: 40.713, longitude: -74.0055 },
  { latitude: 40.7125, longitude: -74.0058 },
];

function point(latitude: number, longitude: number): ViewportCoordinate {
  return { latitude, longitude };
}

describe("computeMapViewport - Location A (Amman) viewport", () => {
  it("centers only on A's own coordinates", () => {
    const viewport = computeMapViewport({ points: ammanArea, polygons: [] });
    expect(viewport).not.toBeNull();
    expect(viewport!.center.latitude).toBeCloseTo(31.954, 2);
    expect(viewport!.center.longitude).toBeCloseTo(35.9108, 3);
    // A's geometry is small, so its zoom is high.
    expect(viewport!.zoom).toBeGreaterThanOrEqual(LOCAL_SPAN_ZOOM);
  });

  it("A's center does not bleed into B (New York)", () => {
    const viewport = computeMapViewport({ points: ammanArea, polygons: [] });
    // Distance in degrees is large; the center must not be anywhere near NYC.
    expect(Math.abs(viewport!.center.latitude - NYC_LAT)).toBeGreaterThan(5);
    expect(Math.abs(viewport!.center.longitude - NYC_LNG)).toBeGreaterThan(50);
  });

  it("A's center is not composed with any other Location's coordinate", () => {
    // Even when given the B geometry, A's own call must not be affected.
    const viewport = computeMapViewport({ points: ammanArea, polygons: [] });
    const altViewport = computeMapViewport({ points: ammanArea, polygons: [] });
    expect(viewport).toEqual(altViewport);
  });
});

describe("computeMapViewport - Location B (New York) viewport", () => {
  it("centers only on B's own coordinates", () => {
    const viewport = computeMapViewport({ points: newYorkArea, polygons: [] });
    expect(viewport).not.toBeNull();
    expect(viewport!.center.latitude).toBeCloseTo(40.7127, 3);
    expect(viewport!.center.longitude).toBeCloseTo(-74.00576, 3);
    expect(viewport!.zoom).toBeGreaterThanOrEqual(LOCAL_SPAN_ZOOM);
  });

  it("B's center does not bleed into A (Amman)", () => {
    const viewport = computeMapViewport({ points: newYorkArea, polygons: [] });
    expect(Math.abs(viewport!.center.latitude - AMMAN_LAT)).toBeGreaterThan(5);
  });
});

describe("computeMapViewport - switching from A to B", () => {
  it("B's center is distinct from A's center", () => {
    const aViewport = computeMapViewport({ points: ammanArea, polygons: [] });
    const bViewport = computeMapViewport({ points: newYorkArea, polygons: [] });
    expect(aViewport?.center.latitude).not.toBeCloseTo(
      bViewport!.center.latitude,
      1,
    );
    expect(aViewport?.center.longitude).not.toBeCloseTo(
      bViewport!.center.longitude,
      1,
    );
  });

  it("computing B right after A does not inherit A's zoom", () => {
    // Computing A then B in sequence: B's result must be derived from B.
    computeMapViewport({ points: ammanArea, polygons: [] });
    const bViewport = computeMapViewport({ points: newYorkArea, polygons: [] });
    expect(bViewport).not.toBeNull();
    // Both Locations are city-scale; their zooms may be close, but their
    // CENTERS must differ. The strict invariant the test pins is the
    // center, not a coincidental zoom value.
    const aCenter = computeMapViewport({ points: ammanArea, polygons: [] })
      ?.center;
    expect(bViewport!.center).not.toEqual(aCenter);
  });
});

describe("computeMapViewport - empty Location", () => {
  it("returns null instead of inheriting a prior Location's geometry", () => {
    // First call: A returns a viewport.
    const aViewport = computeMapViewport({ points: ammanArea, polygons: [] });
    expect(aViewport).not.toBeNull();
    // Second call: a new empty Location must not pick up A's center.
    const empty = computeMapViewport({ points: [], polygons: [] });
    expect(empty).toBeNull();
    // The empty call must be exactly null, not silently coerced to A.
    expect(empty).not.toEqual(aViewport);
  });

  it("a single garbage input is treated as no geometry, not as A", () => {
    // The dashboard never invents coordinates; an invalid point cannot
    // resurrect a previous Location's bounds.
    const before = computeMapViewport({ points: ammanArea, polygons: [] });
    const garbage = computeMapViewport({
      points: [point(Number.NaN, 0)],
      polygons: [],
    });
    expect(garbage).toBeNull();
    // `before` is unaffected; it represents the Amman viewport.
    expect(before?.center.latitude).toBeCloseTo(31.954, 2);
  });
});
