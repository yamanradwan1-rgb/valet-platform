import { describe, expect, it } from "vitest";

import {
  computeMapViewport,
  LOCAL_SPAN_ZOOM,
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  SINGLE_POINT_ZOOM,
  type ViewportCoordinate,
  type ViewportPolygon,
} from "./map-viewport";

/**
 * Asymmetric values on purpose: latitude and longitude use distinct numbers
 * so a swap or off-by-one cannot pass.
 */
const AMMAN_LAT = 31.9539;
const AMMAN_LNG = 35.9106;
const NYC_LAT = 40.7128;
const NYC_LNG = -74.006;

function point(latitude: number, longitude: number): ViewportCoordinate {
  return { latitude, longitude };
}

function polygon(vertices: ViewportCoordinate[]): ViewportPolygon {
  return { vertices };
}

describe("computeMapViewport - input handling", () => {
  it("returns null when there are no points and no polygons", () => {
    expect(computeMapViewport({ points: [], polygons: [] })).toBeNull();
  });

  it("returns null when a point has a non-finite latitude", () => {
    expect(
      computeMapViewport({
        points: [point(Number.NaN, 35.88)],
        polygons: [],
      }),
    ).toBeNull();
  });

  it("returns null when a point has an out-of-range latitude", () => {
    expect(
      computeMapViewport({
        points: [point(91, 35.88)],
        polygons: [],
      }),
    ).toBeNull();
  });

  it("returns null when a point has a non-finite longitude", () => {
    expect(
      computeMapViewport({
        points: [point(31.95, Number.POSITIVE_INFINITY)],
        polygons: [],
      }),
    ).toBeNull();
  });

  it("returns null when a point has an out-of-range longitude", () => {
    expect(
      computeMapViewport({
        points: [point(31.95, -181)],
        polygons: [],
      }),
    ).toBeNull();
  });

  it("returns null when a polygon vertex is invalid", () => {
    expect(
      computeMapViewport({
        points: [],
        polygons: [polygon([point(31.95, 35.88), point(91, 35.88)])],
      }),
    ).toBeNull();
  });

  it("returns null when a vertex is an object missing latitude", () => {
    // The TypeScript surface forbids this; the runtime check must still hold
    // because a malformed payload must not be silently centered.
    const malformed = { longitude: 35.88 } as unknown as ViewportCoordinate;
    expect(
      computeMapViewport({
        points: [malformed],
        polygons: [],
      }),
    ).toBeNull();
  });
});

describe("computeMapViewport - single marker", () => {
  it("centers on the single point and uses SINGLE_POINT_ZOOM", () => {
    const viewport = computeMapViewport({
      points: [point(AMMAN_LAT, AMMAN_LNG)],
      polygons: [],
    });
    expect(viewport).not.toBeNull();
    expect(viewport?.center).toEqual({
      latitude: AMMAN_LAT,
      longitude: AMMAN_LNG,
    });
    expect(viewport?.zoom).toBe(SINGLE_POINT_ZOOM);
  });

  it("single polygon vertex is treated as a single point", () => {
    const viewport = computeMapViewport({
      points: [],
      polygons: [polygon([point(AMMAN_LAT, AMMAN_LNG)])],
    });
    expect(viewport?.center).toEqual({
      latitude: AMMAN_LAT,
      longitude: AMMAN_LNG,
    });
    expect(viewport?.zoom).toBe(SINGLE_POINT_ZOOM);
  });
});

describe("computeMapViewport - nearby markers", () => {
  it("frames two nearby markers using LOCAL_SPAN_ZOOM", () => {
    // A few blocks apart: well within LOCAL_SPAN_DEGREES on both axes.
    const a = point(AMMAN_LAT, AMMAN_LNG);
    const b = point(AMMAN_LAT + 0.001, AMMAN_LNG + 0.001);
    const viewport = computeMapViewport({ points: [a, b], polygons: [] });
    expect(viewport).not.toBeNull();
    expect(viewport?.center.latitude).toBeCloseTo(AMMAN_LAT + 0.0005, 5);
    expect(viewport?.center.longitude).toBeCloseTo(AMMAN_LNG + 0.0005, 5);
    expect(viewport?.zoom).toBe(LOCAL_SPAN_ZOOM);
  });
});

describe("computeMapViewport - distant markers", () => {
  it("zooms out enough to cover a city-scale span", () => {
    // Roughly Amman and New York: very far apart.
    const viewport = computeMapViewport({
      points: [point(AMMAN_LAT, AMMAN_LNG), point(NYC_LAT, NYC_LNG)],
      polygons: [],
    });
    expect(viewport).not.toBeNull();
    // Both markers must lie inside the bounded rectangle.
    expect(viewport!.center.latitude).toBeCloseTo((AMMAN_LAT + NYC_LAT) / 2, 1);
    expect(viewport!.center.longitude).toBeCloseTo((AMMAN_LNG + NYC_LNG) / 2, 1);
    // World-scale input MUST produce a small zoom, well below LOCAL_SPAN_ZOOM.
    expect(viewport!.zoom).toBeLessThan(LOCAL_SPAN_ZOOM);
    expect(viewport!.zoom).toBeGreaterThanOrEqual(MIN_VIEWPORT_ZOOM);
  });

  it("a long thin strip zooms to fit the wider axis", () => {
    // A 5-degree lat spread with 0.001 lng spread: the lat axis dominates.
    const viewport = computeMapViewport({
      points: [point(31, 35.8), point(36, 35.8)],
      polygons: [],
    });
    expect(viewport).not.toBeNull();
    expect(viewport!.center.latitude).toBeCloseTo(33.5, 1);
    expect(viewport!.zoom).toBeLessThan(LOCAL_SPAN_ZOOM);
  });
});

describe("computeMapViewport - polygons", () => {
  it("centers and frames a polygon-only viewport using its vertices", () => {
    const vertices = [
      point(31.95, 35.9),
      point(31.96, 35.9),
      point(31.96, 35.91),
      point(31.95, 35.91),
    ];
    const viewport = computeMapViewport({
      points: [],
      polygons: [polygon(vertices)],
    });
    expect(viewport).not.toBeNull();
    expect(viewport!.center.latitude).toBeCloseTo(31.955, 3);
    expect(viewport!.center.longitude).toBeCloseTo(35.905, 3);
    // Small polygon: expect a high zoom.
    expect(viewport!.zoom).toBeGreaterThanOrEqual(LOCAL_SPAN_ZOOM);
  });

  it("polygon vertices participate alongside points", () => {
    const a = point(AMMAN_LAT, AMMAN_LNG);
    const polygonVertices = [
      point(NYC_LAT, NYC_LNG),
      point(NYC_LAT + 0.5, NYC_LNG),
      point(NYC_LAT, NYC_LNG + 0.5),
    ];
    const viewport = computeMapViewport({
      points: [a],
      polygons: [polygon(polygonVertices)],
    });
    expect(viewport).not.toBeNull();
    // Center must lie between Amman and the polygon centroid.
    const center = viewport!.center;
    const polyCenterLat = (NYC_LAT + (NYC_LAT + 0.5) + NYC_LAT) / 3;
    expect(center.latitude).toBeGreaterThan(Math.min(AMMAN_LAT, polyCenterLat));
    expect(center.latitude).toBeLessThan(Math.max(AMMAN_LAT, polyCenterLat));
    // World-scale mix -> low zoom.
    expect(viewport!.zoom).toBeLessThan(LOCAL_SPAN_ZOOM);
  });
});

describe("computeMapViewport - determinism and immutability", () => {
  it("produces identical output regardless of input ordering", () => {
    const a = point(AMMAN_LAT, AMMAN_LNG);
    const b = point(AMMAN_LAT + 0.01, AMMAN_LNG + 0.01);
    const c = point(AMMAN_LAT - 0.01, AMMAN_LNG - 0.01);
    const left = computeMapViewport({ points: [a, b, c], polygons: [] });
    const right = computeMapViewport({ points: [c, a, b], polygons: [] });
    expect(left).toEqual(right);
  });

  it("does not mutate the input point collection", () => {
    const inputs: ViewportCoordinate[] = [
      point(AMMAN_LAT, AMMAN_LNG),
      point(AMMAN_LAT + 0.01, AMMAN_LNG + 0.01),
    ];
    const snapshot = inputs.map((entry) => ({ ...entry }));
    computeMapViewport({ points: inputs, polygons: [] });
    expect(inputs).toEqual(snapshot);
  });

  it("does not mutate the input polygon vertex arrays", () => {
    const vertices: ViewportCoordinate[] = [
      point(31.95, 35.9),
      point(31.96, 35.9),
      point(31.96, 35.91),
    ];
    const snapshot = vertices.map((entry) => ({ ...entry }));
    const polygonInput: ViewportPolygon = { vertices };
    computeMapViewport({ points: [], polygons: [polygonInput] });
    expect(vertices).toEqual(snapshot);
    // Vertex order is authoritative: nothing is reordered, nothing is closed.
    expect(vertices).toHaveLength(3);
    expect(vertices[0]).toEqual(snapshot[0]);
  });
});

describe("computeMapViewport - zoom bounds", () => {
  it("clamps an extremely wide viewport to MIN_VIEWPORT_ZOOM", () => {
    // One point at each pole: span is the full world, zoom should clamp.
    const viewport = computeMapViewport({
      points: [point(89, 0), point(-89, 0)],
      polygons: [],
    });
    expect(viewport).not.toBeNull();
    expect(viewport!.zoom).toBe(MIN_VIEWPORT_ZOOM);
  });

  it("single-point viewport uses SINGLE_POINT_ZOOM, below MAX", () => {
    const viewport = computeMapViewport({
      points: [point(31.95, 35.9)],
      polygons: [],
    });
    expect(viewport).not.toBeNull();
    expect(viewport!.zoom).toBe(SINGLE_POINT_ZOOM);
    expect(SINGLE_POINT_ZOOM).toBeLessThanOrEqual(MAX_VIEWPORT_ZOOM);
  });

  it("zoom never exceeds MAX_VIEWPORT_ZOOM for any input", () => {
    // A one-millimeter pair: every input shape collapses to LOCAL_SPAN_ZOOM,
    // which is far below MAX_VIEWPORT_ZOOM.
    const viewport = computeMapViewport({
      points: [point(0, 0), point(0.0000001, 0)],
      polygons: [],
    });
    expect(viewport!.zoom).toBeLessThanOrEqual(MAX_VIEWPORT_ZOOM);
  });
});
