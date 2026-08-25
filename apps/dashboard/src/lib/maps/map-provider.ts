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
