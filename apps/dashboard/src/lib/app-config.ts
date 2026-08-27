function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Development map tile/style provider. OpenFreeMap requires no API key and no
 * billing account. A production provider decision may replace this constant
 * behind the MapProvider abstraction without touching domain code.
 */
export const OPENFREEMAP_LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

/**
 * Development-only smoke fallback for the MapContainer smoke harness.
 *
 * D6-004: production surfaces (Map Setup, Live Operations) derive their
 * initial viewport from authoritative geometry belonging to the selected
 * Location. These constants are NOT a production initial viewport and MUST
 * NOT be imported by Map Setup or Live Operations. They exist solely so
 * the local smoke MapContainer can mount a provider instance when no
 * authoritative geometry has been supplied.
 */
export const SMOKE_MAP_CENTER = {
  latitude: readNumberEnv("NEXT_PUBLIC_MAP_CENTER_LAT", 32.562703),
  longitude: readNumberEnv("NEXT_PUBLIC_MAP_CENTER_LNG", 35.880055),
} as const;

export const SMOKE_MAP_ZOOM = readNumberEnv("NEXT_PUBLIC_MAP_CENTER_ZOOM", 17.6);

/**
 * D2-005: the former development-only single-location bootstrap
 * (`NEXT_PUBLIC_DEV_LOCATION_ID` and friends) was REMOVED.
 *
 * The dashboard now derives its available locations exclusively from the
 * authenticated backend endpoint GET /v1/staff/dashboard/locations through
 * the LocationProvider bootstrap. There is deliberately no environment-based
 * fallback: a hard-coded or env-provided location could never be more than a
 * UX default, and after real authorized bootstrap it would risk diverging
 * from server-side authorization truth.
 */
