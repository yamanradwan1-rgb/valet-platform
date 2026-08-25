import type { LngLatLike } from "maplibre-gl";

import { OPENFREEMAP_LIBERTY_STYLE_URL } from "../app-config";
import type {
  MapInitOptions,
  MapInstance,
  MapProviderAdapter,
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

/**
 * Development adapter: MapLibre GL JS rendering OpenFreeMap's Liberty style.
 *
 * - No API key, no billing account, no map secret.
 * - Swappable with a future Google Maps adapter implementing the same
 *   MapProviderAdapter interface.
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
    return {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        map.remove();
      },
    };
  }
}
