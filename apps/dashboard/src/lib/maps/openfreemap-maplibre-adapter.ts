import type { LngLatLike, Marker } from "maplibre-gl";

import { OPENFREEMAP_LIBERTY_STYLE_URL } from "../app-config";
import type {
  MapInitOptions,
  MapInstance,
  MapMarkerDescriptor,
  MapProviderAdapter,
  MarkerCapableMapInstance,
} from "./map-provider";

import "maplibre-gl/dist/maplibre-gl.css";

type MaplibreModule = typeof import("maplibre-gl");

let maplibrePromise: Promise<MaplibreModule> | null = null;

function loadMaplibre(): Promise<MaplibreModule> {
  if (maplibrePromise === null) {
    // The library touches browser globals at import time; it is loaded
    // dynamically so server rendering never imports it.
    maplibrePromise = import("maplibre-gl");
  }
  return maplibrePromise;
}

interface RenderedMarker {
  readonly marker: Marker;
  readonly element: HTMLButtonElement;
  readonly descriptor: MapMarkerDescriptor;
}

function createMarkerElement(
  descriptor: MapMarkerDescriptor,
  onSelectMarker: ((markerId: string) => void) | undefined,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "live-op-marker";
  element.classList.add(
    descriptor.tone === "positive" ? "is-live" : "is-stale",
  );
  if (descriptor.selected) element.classList.add("is-selected");
  element.setAttribute("aria-label", descriptor.ariaLabel);
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = descriptor.glyph;
  element.appendChild(glyph);
  if (onSelectMarker !== undefined) {
    const selectMarker = onSelectMarker;
    element.addEventListener("click", () => {
      selectMarker(descriptor.id);
    });
  }
  return element;
}

/**
 * Development adapter: MapLibre GL JS rendering OpenFreeMap's Liberty style.
 *
 * - No API key, no billing account, no map secret.
 * - Swappable with a future Google Maps adapter implementing the same
 *   MapProviderAdapter interface.
 * - Implements the optional marker capability through plain MapLibre DOM
 *   markers; domain code only sees MarkerCapableMapInstance.
 */
export class OpenFreeMapLibreAdapter implements MapProviderAdapter {
  readonly name = "maplibre-openfreemap";
  readonly requiresApiKey = false;

  async createMap(
    container: HTMLElement,
    options: MapInitOptions,
  ): Promise<MapInstance> {
    const maplibre = await loadMaplibre();
    const center: LngLatLike = [
      options.center.longitude,
      options.center.latitude,
    ];
    let destroyed = false;
    const map = new maplibre.Map({
      container,
      style: OPENFREEMAP_LIBERTY_STYLE_URL,
      center,
      zoom: options.zoom,
    });
    const rendered = new Map<string, RenderedMarker>();

    const instance: MarkerCapableMapInstance = {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        map.remove();
        rendered.clear();
      },
      replaceMarkers(markers: readonly MapMarkerDescriptor[]) {
        if (destroyed) return;
        for (const entry of rendered.values()) entry.marker.remove();
        rendered.clear();
        for (const descriptor of markers) {
          const element = createMarkerElement(descriptor, options.onSelectMarker);
          const marker = new maplibre.Marker({ element })
            .setLngLat([descriptor.longitude, descriptor.latitude])
            .addTo(map);
          rendered.set(descriptor.id, { marker, element, descriptor });
        }
      },
      focusMarker(id: string): boolean {
        if (destroyed) return false;
        const entry = rendered.get(id);
        if (entry === undefined) return false;
        map.panTo([
          entry.descriptor.longitude,
          entry.descriptor.latitude,
        ]);
        return true;
      },
    };
    return instance;
  }
}
