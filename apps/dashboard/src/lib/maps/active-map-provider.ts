import { OpenFreeMapLibreAdapter } from "./openfreemap-maplibre-adapter";
import type { MapProviderAdapter } from "./map-provider";

/**
 * Single selection point for the dashboard's map provider.
 *
 * Domain components must depend only on the MapProviderAdapter interface and
 * obtain instances here. Replacing the development MapLibre/OpenFreeMap stack
 * with another provider (e.g., Google Maps) is confined to this function.
 */
export function createActiveMapProvider(): MapProviderAdapter {
  return new OpenFreeMapLibreAdapter();
}
