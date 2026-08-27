/**
 * Provider-neutral map viewport calculation (D6-004).
 *
 * The dashboard's map surfaces initialize their viewport from authoritative
 * geometry belonging to the selected Location. Fixed development coordinates
 * MUST NOT be used as production truth; this module replaces that defect
 * with a small, deterministic, testable viewport computation.
 *
 * Inputs are *already* provider-neutral collections of authoritative
 * coordinates (persisted MapPoints, MapArea vertices, backend-reported live
 * task positions). The function never invents coordinates: when the input
 * collection is empty, it returns `null` and the caller shows its existing
 * honest no-geometry / empty posture without substituting a development
 * center.
 *
 * Output remains provider-neutral: `{ center, zoom }`, where `center` is the
 * same `MapCenter` shape the MapProvider already accepts. No MapLibre /
 * LngLatBounds objects are exposed to feature code.
 *
 * The algorithm is a plain bounding-box fit. Latitude and longitude are
 * validated as finite numbers within their WGS-84 ranges. Polygon vertex
 * arrays are walked in their stored order; ordering of the input collections
 * does not influence the result. Input objects are never mutated.
 */

import type { MapCenter } from "./map-provider";

/** A single coordinate; matches `MapMarkerDescriptor`/`MapMarkerDefinition`. */
export interface ViewportCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * A polygon for viewport purposes: its ordered vertex array. Polygon
 * vertex ORDER is preserved by storage; this module only reads.
 */
export interface ViewportPolygon {
  readonly vertices: readonly ViewportCoordinate[];
}

export interface MapViewport {
  readonly center: MapCenter;
  readonly zoom: number;
}

export const MIN_VIEWPORT_ZOOM = 1;
export const MAX_VIEWPORT_ZOOM = 19;
/**
 * "Single point" zoom when geometry fits inside this many degrees.
 * Tuned for a typical hotel/parking lot on the dashboard, well below the
 * city-level 11-13 band so a single map point opens focused.
 */
export const SINGLE_POINT_ZOOM = 17;
/**
 * Span below this many degrees in BOTH axes produces a tightly framed
 * mid-zoom viewport without losing context.
 */
export const LOCAL_SPAN_DEGREES = 0.02;
/** Local-span mid zoom (a few blocks). */
export const LOCAL_SPAN_ZOOM = 16;
/**
 * When the only geometry is a single point, we still want a small buffer
 * of visual context around it instead of a hard satellite pin.
 */
export const SINGLE_POINT_BUFFER_DEGREES = 0.005;

const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidCoordinate(
  value: ViewportCoordinate,
): value is { readonly latitude: number; readonly longitude: number } {
  return (
    isFiniteNumber(value.latitude) &&
    isFiniteNumber(value.longitude) &&
    value.latitude >= LATITUDE_MIN &&
    value.latitude <= LATITUDE_MAX &&
    value.longitude >= LONGITUDE_MIN &&
    value.longitude <= LONGITUDE_MAX
  );
}

function clampZoom(zoom: number): number {
  if (!isFiniteNumber(zoom)) return MIN_VIEWPORT_ZOOM;
  if (zoom < MIN_VIEWPORT_ZOOM) return MIN_VIEWPORT_ZOOM;
  if (zoom > MAX_VIEWPORT_ZOOM) return MAX_VIEWPORT_ZOOM;
  return zoom;
}

/**
 * Linearly maps an "effective span" in degrees to a zoom level.
 * - Below `LOCAL_SPAN_DEGREES`: returns `LOCAL_SPAN_ZOOM` (locally framed).
 * - Single point: returns `SINGLE_POINT_ZOOM` with a tiny buffer handled
 *   by the caller.
 * - Otherwise: log2(360 / span) gives the zoom at which `span` degrees fits
 *   the full width at the equator. A small offset widens the view a little
 *   beyond the exact fit so geometry has breathing room. Longitude is
 *   scaled by cos(latitude) to correct for Mercator compression; if the
 *   input spans the antimeridian this approximation may underestimate the
 *   zoom — explicit antimeridian handling is documented but not implemented
 *   because Location geometry is not expected to wrap the globe.
 */
function fitZoom(
  effectiveSpanDegrees: number,
  referenceLatitudeRadians: number,
): number {
  if (!isFiniteNumber(effectiveSpanDegrees)) return SINGLE_POINT_ZOOM;
  if (effectiveSpanDegrees <= 0) return SINGLE_POINT_ZOOM;
  if (effectiveSpanDegrees <= LOCAL_SPAN_DEGREES) return LOCAL_SPAN_ZOOM;
  // Mercator compression: longitudinal degree length is proportional to
  // cos(latitude). Guard against the poles where cos -> 0.
  const cosLatitude = Math.max(Math.abs(Math.cos(referenceLatitudeRadians)), 0.0001);
  const longitudeAdjustedSpan = effectiveSpanDegrees / cosLatitude;
  const z = Math.log2(360 / longitudeAdjustedSpan) - 0.5;
  return z;
}

interface BoundsAccumulator {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /** Reference latitude (mid) used for Mercator-aware zoom. */
  refLatRadians: number;
  hasPoint: boolean;
}

function pushCoordinate(
  bounds: BoundsAccumulator,
  latitude: number,
  longitude: number,
): void {
  if (!bounds.hasPoint) {
    bounds.minLat = latitude;
    bounds.maxLat = latitude;
    bounds.minLng = longitude;
    bounds.maxLng = longitude;
    bounds.refLatRadians = (latitude * Math.PI) / 180;
    bounds.hasPoint = true;
    return;
  }
  if (latitude < bounds.minLat) bounds.minLat = latitude;
  if (latitude > bounds.maxLat) bounds.maxLat = latitude;
  if (longitude < bounds.minLng) bounds.minLng = longitude;
  if (longitude > bounds.maxLng) bounds.maxLng = longitude;
}

/**
 * Walks every input coordinate in stored order, validates it, and updates the
 * bounding box. Stops early when an invalid coordinate is encountered so the
 * caller can fall back to a safe posture instead of swallowing bad data into
 * a misleading viewport. The function never mutates its inputs.
 */
function collectBounds(
  points: readonly ViewportCoordinate[],
  polygons: readonly ViewportPolygon[],
): BoundsAccumulator {
  const bounds: BoundsAccumulator = {
    hasPoint: false,
    maxLat: 0,
    maxLng: 0,
    minLat: 0,
    minLng: 0,
    refLatRadians: 0,
  };
  for (const point of points) {
    if (!isValidCoordinate(point)) {
      return { ...bounds, hasPoint: false };
    }
    pushCoordinate(bounds, point.latitude, point.longitude);
  }
  for (const polygon of polygons) {
    for (const vertex of polygon.vertices) {
      if (!isValidCoordinate(vertex)) {
        return { ...bounds, hasPoint: false };
      }
      pushCoordinate(bounds, vertex.latitude, vertex.longitude);
    }
  }
  return bounds;
}

export interface ViewportInput {
  readonly points: readonly ViewportCoordinate[];
  readonly polygons: readonly ViewportPolygon[];
}

/**
 * Computes a provider-neutral viewport from the given authoritative
 * coordinate collections. Returns `null` when:
 *
 * - the inputs contain no valid coordinate;
 * - the inputs contain an out-of-range or non-finite coordinate (caller
 *   should not silently absorb malformed data into a centered viewport);
 * - either input collection is empty AND the other is also empty.
 *
 * The returned viewport is deterministic: the same inputs always produce
 * the same output regardless of array identity, because the algorithm
 * reads coordinates in their stored index order and never sorts them.
 *
 * Latitude and longitude are validated independently. The result is
 * guaranteed to be a finite, in-range coordinate plus a finite, clamped
 * zoom.
 */
export function computeMapViewport(input: ViewportInput): MapViewport | null {
  const bounds = collectBounds(input.points, input.polygons);
  if (!bounds.hasPoint) return null;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;
  const isSinglePoint = latSpan === 0 && lngSpan === 0;
  if (isSinglePoint) {
    return {
      center: { latitude: centerLat, longitude: centerLng },
      zoom: SINGLE_POINT_ZOOM,
    };
  }
  const referenceLatitudeRadians = (centerLat * Math.PI) / 180;
  // effectiveSpan picks the wider axis, but for highly elongated inputs it
  // is more useful to fit the larger span so the map shows everything.
  const effectiveSpan = Math.max(latSpan, lngSpan);
  const rawZoom = fitZoom(effectiveSpan, referenceLatitudeRadians);
  return {
    center: { latitude: centerLat, longitude: centerLng },
    zoom: clampZoom(rawZoom),
  };
}
