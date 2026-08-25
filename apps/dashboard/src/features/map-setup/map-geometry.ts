import type {
  LocationMapArea,
  LocationMapPoint,
} from "@valet/contracts";

import type {
  MapMarkerDefinition,
  MapPolygonDefinition,
} from "../../lib/maps/map-provider";

/**
 * Pure Map Setup geometry helpers.
 *
 * This module owns every translation between backend-configured entities and
 * provider-neutral map definitions. It never touches a provider SDK, never
 * reorders authoritative vertex arrays, and never rounds coordinates beyond
 * what was given.
 */

/** Backend contract bounds for area polygons. */
export const MIN_VERTICES = 3;
export const MAX_VERTICES = 500;

const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;

/** Presentation-only colors for the supported backend enums. */
const POINT_KIND_COLORS = {
  DROP_OFF: "#d89434",
  ENTRANCE: "#2f9b78",
  PICKUP: "#176bff",
} as const;

const AREA_PURPOSE_COLORS = {
  OVERFLOW: "#d89434",
  PARKING: "#176bff",
  RESTRICTED: "#d95c63",
  STAGING: "#6f7c91",
} as const;

export function pointKindColor(kind: LocationMapPoint["kind"]): string {
  return POINT_KIND_COLORS[kind];
}

export function areaPurposeColor(
  purpose: LocationMapArea["purpose"],
): string {
  return AREA_PURPOSE_COLORS[purpose];
}

/**
 * Parses one decimal coordinate string without rounding. Returns null for
 * anything empty, non-finite, out of range, or with leftover characters.
 */
export function parseCoordinate(
  raw: string,
  bounds: "latitude" | "longitude",
): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (bounds === "latitude") {
    return value >= LATITUDE_MIN && value <= LATITUDE_MAX ? value : null;
  }
  return value >= LONGITUDE_MIN && value <= LONGITUDE_MAX ? value : null;
}

export interface ParsedVertex {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Parses the ordered "latitude,longitude" per line format. Input line order
 * is preserved exactly as typed; no sorting, deduplication or closing vertex
 * is ever added. Returns null when any line is malformed.
 */
export function parseVertexList(raw: string): ParsedVertex[] | null {
  const lines = raw.split(/\r?\n/);
  const vertices: ParsedVertex[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 && lines.length === 1) continue;
    if (trimmed.length === 0) return null;
    const parts = trimmed.split(",");
    if (parts.length !== 2) return null;
    const latitude = parseCoordinate(parts[0] ?? "", "latitude");
    const longitude = parseCoordinate(parts[1] ?? "", "longitude");
    if (latitude === null || longitude === null) return null;
    vertices.push({ latitude, longitude });
  }
  return vertices;
}

/** Renders vertices back to the editable text format (exact round-trip). */
export function formatVertexList(
  vertices: readonly ParsedVertex[],
): string {
  return vertices
    .map((vertex) => `${String(vertex.latitude)},${String(vertex.longitude)}`)
    .join("\n");
}

export function buildPointMarkers(
  points: readonly LocationMapPoint[],
  selectedPointId: string | null,
): MapMarkerDefinition[] {
  return points.map((point) => ({
    color: pointKindColor(point.kind),
    id: point.id,
    latitude: point.latitude,
    longitude: point.longitude,
    selected: point.id === selectedPointId,
  }));
}

/**
 * Maps configured areas onto provider-neutral polygons using the stored,
 * authoritative vertex order (ascending `position`). Ring closure happens
 * only inside adapters at render time.
 */
export function buildAreaPolygons(
  areas: readonly LocationMapArea[],
  selectedAreaId: string | null,
): MapPolygonDefinition[] {
  return [...areas]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((area) => ({
      color: areaPurposeColor(area.purpose),
      id: area.id,
      selected: area.id === selectedAreaId,
      vertices: orderVertices(area.vertices),
    }));
}

/** Orders stored vertices by their authoritative `position`. */
export function orderVertices(
  vertices: LocationMapArea["vertices"],
): ParsedVertex[] {
  return [...vertices]
    .sort((left, right) => left.position - right.position)
    .map((vertex) => ({
      latitude: vertex.latitude,
      longitude: vertex.longitude,
    }));
}

export interface MapSetupStats {
  readonly areasTotal: number;
  readonly activeAreas: number;
  readonly activePoints: number;
  readonly pointsTotal: number;
}

export function mapSetupStats(
  points: readonly LocationMapPoint[],
  areas: readonly LocationMapArea[],
): MapSetupStats {
  return {
    activeAreas: areas.filter((area) => area.active).length,
    activePoints: points.filter((point) => point.active).length,
    areasTotal: areas.length,
    pointsTotal: points.length,
  };
}
