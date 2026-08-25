/**
 * Map provider abstraction.
 *
 * Dashboard domain code (Live Operations, Map Setup) depends only on these
 * types. Provider-specific SDKs are reached exclusively through adapters, so
 * a future Google Maps adapter can replace the development MapLibre adapter
 * without rewriting domain components.
 */
export interface MapCenter {
  readonly latitude: number;
  readonly longitude: number;
}

export interface MapInitOptions {
  readonly center: MapCenter;
  readonly zoom: number;
  /**
   * Invoked when the user activates a marker rendered by a marker-capable
   * adapter. Purely optional; adapters without markers ignore it.
   */
  readonly onSelectMarker?: ((markerId: string) => void) | undefined;
}

export interface MapInstance {
  /** Releases all provider resources; must be idempotent. */
  destroy(): void;
}

export interface MapProviderAdapter {
  /** Stable adapter identifier, e.g. "maplibre-openfreemap". */
  readonly name: string;
  /**
   * True when no API key/billing secret is needed for initialization.
   * Used by diagnostics and to guarantee the dev stack stays key-free.
   */
  readonly requiresApiKey: boolean;
  createMap(
    container: HTMLElement,
    options: MapInitOptions,
  ): Promise<MapInstance>;
}

/**
 * Provider-neutral marker description. Domain code expresses WHAT to show;
 * adapters decide HOW to render it. Only backend-reported coordinates may be
 * passed here — callers must never synthesize positions.
 */
export interface MapMarkerDescriptor {
  /** Stable domain identifier (e.g. tracking session id). */
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Short glyph rendered inside the marker (e.g. "P" / "R"). */
  readonly glyph: string;
  /** Semantic tone; adapters map it onto their visual system. */
  readonly tone: "positive" | "warning";
  readonly selected: boolean;
  /** Fully resolved accessible name (already localized by the caller). */
  readonly ariaLabel: string;
}

/**
 * Optional capability of a created map: rendering/locating markers. Providers
 * without marker support simply return an instance that fails
 * `supportsMarkers`; domain code degrades honestly instead of crashing.
 */
export interface MarkerCapableMapInstance extends MapInstance {
  /** Atomically swaps the full visible marker set for the given descriptors. */
  replaceMarkers(markers: readonly MapMarkerDescriptor[]): void;
  /** Pans the map so the marker is visible; false when the id is unknown. */
  focusMarker(id: string): boolean;
}

export function supportsMarkers(
  instance: MapInstance,
): instance is MarkerCapableMapInstance {
  return (
    typeof (instance as Partial<MarkerCapableMapInstance>).replaceMarkers ===
    "function"
  );
}
