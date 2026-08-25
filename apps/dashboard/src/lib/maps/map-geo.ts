/**
 * Pure coordinate-order boundary between domain semantics and GeoJSON.
 *
 * Domain/backend coordinates are ALWAYS {latitude, longitude}. GeoJSON /
 * MapLibre positions are ALWAYS [longitude, latitude]. Every conversion
 * between the two goes through this module so a lat/lng swap has exactly one
 * place to hide — and one place to test with asymmetric values.
 */

export interface DomainCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/** Domain {latitude, longitude} -> GeoJSON position [longitude, latitude]. */
export function toGeoJsonPosition(coordinate: DomainCoordinate): [
  number,
  number,
] {
  return [coordinate.longitude, coordinate.latitude];
}

/** Provider event position (lng/lat) -> domain {latitude, longitude}. */
export function toDomainCoordinate(position: {
  readonly lat: number;
  readonly lng: number;
}): DomainCoordinate {
  return { latitude: position.lat, longitude: position.lng };
}

export interface MapGeoMarker {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly color?: string;
  readonly selected?: boolean;
}

export interface MapGeoPolygon {
  readonly id: string;
  readonly vertices: readonly DomainCoordinate[];
  readonly color?: string;
  readonly selected?: boolean;
}

const DEFAULT_COLOR = "#176bff";

interface PointFeature {
  readonly type: "Feature";
  readonly geometry: {
    readonly type: "Point";
    readonly coordinates: [number, number];
  };
  readonly properties: {
    readonly color: string;
    readonly id: string;
    readonly selected: number;
  };
}

interface PolygonFeature {
  readonly type: "Feature";
  readonly geometry: {
    readonly type: "Polygon";
    readonly coordinates: [Array<[number, number]>];
  };
  readonly properties: {
    readonly color: string;
    readonly id: string;
    readonly selected: number;
  };
}

export function markerFeature(marker: MapGeoMarker): PointFeature {
  return {
    geometry: {
      coordinates: toGeoJsonPosition(marker),
      type: "Point",
    },
    properties: {
      color: marker.color ?? DEFAULT_COLOR,
      id: marker.id,
      selected: marker.selected === true ? 1 : 0,
    },
    type: "Feature",
  };
}

/**
 * Builds a polygon feature from authoritative vertex order. The ring is
 * closed HERE for rendering ONLY: the closure vertex exists inside the
 * returned feature's internal ring copy and never mutates (nor is ever read
 * back from) the caller's stored vertex array or any API payload.
 */
export function polygonFeature(
  polygon: MapGeoPolygon,
): PolygonFeature | null {
  const ring = polygon.vertices.map(toGeoJsonPosition);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length < 3 || first === undefined || last === undefined) {
    return null;
  }
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return {
    geometry: { coordinates: [ring], type: "Polygon" },
    properties: {
      color: polygon.color ?? DEFAULT_COLOR,
      id: polygon.id,
      selected: polygon.selected === true ? 1 : 0,
    },
    type: "Feature",
  };
}
