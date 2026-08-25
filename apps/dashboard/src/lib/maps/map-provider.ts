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

/* ---------------------------------------------------------------------------
 * Provider-neutral live-marker capability (D3-001).
 *
 * Live Operations renders positioned task markers as accessible controls:
 * glyph, tone and selection are semantic, and adapters own rendering.
 * ------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
 * Provider-neutral setup primitives (D3-002).
 *
 * Generic point/polygon/click concepts shared by dashboard surfaces that
 * render configured map content. They intentionally carry no Live Operations
 * or Map Setup domain semantics: colors and selection are presentation hints
 * supplied by the calling feature.
 *
 * This capability intentionally coexists with the live-marker capability
 * above instead of being merged into it: live markers are accessible DOM
 * controls with selection/focus behavior driven by operations state, while
 * setup layers are provider-rendered geometry with surface click capture.
 * Adapters implement each family through disjoint mechanisms so neither
 * feature's lifecycle interferes with the other.
 * ------------------------------------------------------------------------- */

/** One clickable rendered point marker. */
export interface MapMarkerDefinition {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Presentation hint; adapters map it onto provider styling capability. */
  readonly color?: string;
  readonly selected?: boolean;
}

/**
 * One rendered polygon. `vertices` is authoritative order; adapters may close
 * the ring visually at render time only — stored data is never rewritten.
 */
export interface MapPolygonDefinition {
  readonly id: string;
  readonly vertices: readonly MapCenter[];
  readonly color?: string;
  readonly selected?: boolean;
}

/** A click/tap on the map surface, with any rendered feature that was hit. */
export interface MapClick {
  readonly coordinate: MapCenter;
  readonly markerId: string | null;
  readonly polygonId: string | null;
}

export type MapClickHandler = (click: MapClick) => void;

/**
 * Map instance with additive rendering for configured points and polygons.
 * Adapters that only support basic mounting still satisfy `MapInstance`.
 */
export interface InteractiveMapInstance extends MapInstance {
  /** Replaces every rendered marker with the given definitions. */
  setMarkers(markers: readonly MapMarkerDefinition[]): void;
  /** Replaces every rendered polygon with the given definitions. */
  setPolygons(polygons: readonly MapPolygonDefinition[]): void;
  /** Registers the single map-click handler; null removes it. */
  setClickHandler(handler: MapClickHandler | null): void;
}

/**
 * Runtime capability probe so features degrade honestly on adapters that
 * only support basic mounting.
 */
export function asInteractiveMapInstance(
  instance: MapInstance,
): InteractiveMapInstance | null {
  if (
    typeof (instance as Partial<InteractiveMapInstance>).setMarkers !==
    "function"
  ) {
    return null;
  }
  return instance as InteractiveMapInstance;
}
