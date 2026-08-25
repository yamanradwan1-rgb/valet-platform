function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalEnv(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  return raw.trim();
}

/**
 * Development map tile/style provider. OpenFreeMap requires no API key and no
 * billing account. A production provider decision may replace this constant
 * behind the MapProvider abstraction without touching domain code.
 */
export const OPENFREEMAP_LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

/**
 * Development map center: hotel + surrounding parking areas.
 * Overridable for local development only; never a production secret.
 */
export const DEV_MAP_CENTER = {
  latitude: readNumberEnv("NEXT_PUBLIC_MAP_CENTER_LAT", 32.562703),
  longitude: readNumberEnv("NEXT_PUBLIC_MAP_CENTER_LNG", 35.880055),
} as const;

export const DEV_MAP_ZOOM = readNumberEnv("NEXT_PUBLIC_MAP_CENTER_ZOOM", 17.6);

/**
 * Development-only single-location bootstrap.
 *
 * The backend currently has NO public endpoint that enumerates the Locations a
 * LOCATION_MANAGER may manage (only an internal query helper exists). Until a
 * real bootstrap contract ships, the dashboard keeps a single-location posture
 * driven by explicit local configuration. This value is NEVER authorization:
 * every API call remains authorized server-side by exact Location ID.
 */
export interface DevLocationBootstrap {
  readonly locationId: string;
  readonly organizationId: string | null;
  readonly name: string | null;
  readonly currency: string | null;
  readonly timezone: string | null;
}

export function getDevLocationBootstrap(): DevLocationBootstrap | null {
  const locationId = readOptionalEnv("NEXT_PUBLIC_DEV_LOCATION_ID");
  if (locationId === null) return null;
  return {
    locationId,
    organizationId: readOptionalEnv("NEXT_PUBLIC_DEV_ORGANIZATION_ID"),
    name: readOptionalEnv("NEXT_PUBLIC_DEV_LOCATION_NAME"),
    currency: readOptionalEnv("NEXT_PUBLIC_DEV_LOCATION_CURRENCY"),
    timezone: readOptionalEnv("NEXT_PUBLIC_DEV_LOCATION_TIMEZONE"),
  };
}
