import type { GeoCenter } from "../../../lib/maps/google-maps-sdk";

const earthRadiusMeters = 6371008.8;
const degrees = 180 / Math.PI;

function wrapLongitude(longitude: number): number {
  if (longitude >= -180 && longitude <= 180) return longitude;
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** Geographic bounds of the entire circular zone, not just its center.
 * Cardinal extrema of a spherical circle bound every point on its edge.
 */
export function attendanceZoneBoundPoints(zone: {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
}): GeoCenter[] {
  const { latitude, longitude, radiusMeters } = zone;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(radiusMeters) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    radiusMeters < 5 ||
    radiusMeters > 1000
  ) return [];

  const center = { lat: latitude, lng: wrapLongitude(longitude) };
  const angularRadius = radiusMeters / earthRadiusMeters;
  const latitudeExtent = angularRadius * degrees;
  const north = Math.min(90, latitude + latitudeExtent);
  const south = Math.max(-90, latitude - latitudeExtent);
  const crossesPole = north === 90 || south === -90;
  const longitudeExtent = crossesPole
    ? 180
    : Math.asin(
        Math.min(1, Math.sin(angularRadius) / Math.cos(latitude / degrees)),
      ) * degrees;

  const points = [
    center,
    { lat: north, lng: center.lng },
    { lat: south, lng: center.lng },
    { lat: latitude, lng: wrapLongitude(longitude + longitudeExtent) },
    { lat: latitude, lng: wrapLongitude(longitude - longitudeExtent) },
  ];
  if (crossesPole) {
    for (const turn of [-90, 90, 180]) {
      points.push({ lat: latitude, lng: wrapLongitude(longitude + turn) });
    }
  }
  return points;
}
