import type { GeoJSONSource, LngLatLike } from "maplibre-gl";

import { OPENFREEMAP_LIBERTY_STYLE_URL } from "../app-config";
import {
  markerFeature,
  polygonFeature,
  toDomainCoordinate,
} from "./map-geo";
import {
  createMarkerElement,
  type RenderedMarker,
} from "./openfreemap-maplibre-live-markers";
import type {
  InteractiveMapInstance,
  MapClickHandler,
  MapInitOptions,
  MapMarkerDescriptor,
  MapMarkerDefinition,
  MapPolygonDefinition,
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

/* ---------------------------------------------------------------------------
 * Setup interactive-layer plumbing (D3-002).
 *
 * Configured points/polygons render through namespaced GeoJSON sources whose
 * contents are fully replaced via setData; nothing accumulates across calls.
 * ------------------------------------------------------------------------- */

// Collision-safe ids: namespaced to this dashboard's setup layers only.
const MARKERS_SOURCE_ID = "dashboard-setup-markers";
const POLYGONS_SOURCE_ID = "dashboard-setup-polygons";
const MARKER_LAYER_ID = "dashboard-setup-marker-circle";
const POLYGON_FILL_LAYER_ID = "dashboard-setup-polygon-fill";
const POLYGON_LINE_LAYER_ID = "dashboard-setup-polygon-line";

interface PlainPolygonFeature {
  readonly geometry: {
    readonly coordinates: [Array<[number, number]>];
    readonly type: "Polygon";
  };
  readonly properties: {
    readonly color: string;
    readonly id: string;
    readonly selected: number;
  };
  readonly type: "Feature";
}

function setGeoJsonData(
  source: ReturnType<InstanceType<MaplibreModule["Map"]>["getSource"]>,
  data: {
    features: Array<ReturnType<typeof markerFeature> | PlainPolygonFeature>;
    type: "FeatureCollection";
  },
): void {
  if (source === undefined || !("setData" in source)) return;
  (source as GeoJSONSource).setData(data);
}

/**
 * Development adapter: MapLibre GL JS rendering OpenFreeMap's Liberty style.
 *
 * - No API key, no billing account, no map secret.
 * - Swappable with a future Google Maps adapter implementing the same
 *   MapProviderAdapter interface.
 * - Implements the optional live-marker capability through plain MapLibre
 *   DOM markers; domain code only sees MarkerCapableMapInstance.
 * - Additively implements InteractiveMapInstance so setup surfaces can render
 *   configured points/polygons and receive clicks through provider-neutral
 *   definitions. Coordinate-order conversion lives exclusively in the pure
 *   ../map-geo module.
 * - Both capabilities coexist through disjoint mechanisms: live markers are
 *   registry-owned DOM controls fed by replaceMarkers/focusMarker, setup
 *   content lives in namespaced GeoJSON sources replaced via setData behind
 *   one stable map-click listener swapped through a handler indirection, so
 *   neither family stacks listeners or collides with the other.
 */
export class OpenFreeMapLibreAdapter implements MapProviderAdapter {
  readonly name = "maplibre-openfreemap";
  readonly requiresApiKey = false;

  async createMap(
    container: HTMLElement,
    options: MapInitOptions,
  ): Promise<MarkerCapableMapInstance & InteractiveMapInstance> {
    const maplibre = await loadMaplibre();
    // GeoJSON/MapLibre positions are [longitude, latitude]; the init options
    // carry domain semantics and are converted here at the single boundary.
    const center: LngLatLike = [
      options.center.longitude,
      options.center.latitude,
    ];
    let destroyed = false;
    let ready = false;
    let pendingMarkers: readonly MapMarkerDefinition[] = [];
    let pendingPolygons: readonly MapPolygonDefinition[] = [];
    let clickHandler: MapClickHandler | null = null;

    const map = new maplibre.Map({
      container,
      style: OPENFREEMAP_LIBERTY_STYLE_URL,
      center,
      zoom: options.zoom,
    });
    const rendered = new Map<string, RenderedMarker>();

    function applyMarkers(markers: readonly MapMarkerDefinition[]): void {
      if (destroyed || !ready) return;
      setGeoJsonData(map.getSource(MARKERS_SOURCE_ID), {
        features: markers.map(markerFeature),
        type: "FeatureCollection",
      });
    }

    function applyPolygons(polygons: readonly MapPolygonDefinition[]): void {
      if (destroyed || !ready) return;
      const features: PlainPolygonFeature[] = [];
      for (const polygon of polygons) {
        const feature = polygonFeature(polygon);
        if (feature !== null) features.push(feature);
      }
      setGeoJsonData(map.getSource(POLYGONS_SOURCE_ID), {
        features,
        type: "FeatureCollection",
      });
    }

    function addSetupLayers(): void {
      map.addSource(MARKERS_SOURCE_ID, {
        type: "geojson",
        data: { features: [], type: "FeatureCollection" },
      });
      map.addSource(POLYGONS_SOURCE_ID, {
        type: "geojson",
        data: { features: [], type: "FeatureCollection" },
      });
      map.addLayer({
        id: POLYGON_FILL_LAYER_ID,
        type: "fill",
        source: POLYGONS_SOURCE_ID,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.34, 0.16],
        },
      });
      map.addLayer({
        id: POLYGON_LINE_LAYER_ID,
        type: "line",
        source: POLYGONS_SOURCE_ID,
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["==", ["get", "selected"], 1], 3, 1.5],
        },
      });
      map.addLayer({
        id: MARKER_LAYER_ID,
        type: "circle",
        source: MARKERS_SOURCE_ID,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["case", ["==", ["get", "selected"], 1], 9, 6],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }

    map.on("load", () => {
      if (destroyed) return;
      addSetupLayers();
      ready = true;
      applyMarkers(pendingMarkers);
      applyPolygons(pendingPolygons);
      pendingMarkers = [];
      pendingPolygons = [];
    });

    // Exactly one DOM click listener for the instance lifetime; feature
    // callbacks are swapped through the stable clickHandler indirection so
    // replacement can never stack listeners. Hit testing queries only the
    // namespaced setup layers, so live DOM markers never leak ids into the
    // setup click payload.
    map.on("click", (event) => {
      if (destroyed || clickHandler === null) return;
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [MARKER_LAYER_ID, POLYGON_FILL_LAYER_ID],
      });
      let markerId: string | null = null;
      let polygonId: string | null = null;
      for (const feature of hits) {
        const id =
          typeof feature.properties?.id === "string"
            ? feature.properties.id
            : null;
        if (markerId === null && feature.layer.id === MARKER_LAYER_ID) {
          markerId = id;
        } else if (
          polygonId === null &&
          feature.layer.id === POLYGON_FILL_LAYER_ID
        ) {
          polygonId = id;
        }
      }
      clickHandler({
        coordinate: toDomainCoordinate(event.lngLat),
        markerId,
        polygonId,
      });
    });

    const instance: MarkerCapableMapInstance & InteractiveMapInstance = {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        ready = false;
        clickHandler = null;
        // Detach every live DOM marker, then remove the map itself, which
        // drops all remaining listeners, sources and layers of both
        // capability families.
        for (const entry of rendered.values()) entry.marker.remove();
        rendered.clear();
        map.remove();
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
      setMarkers(markers) {
        if (ready) {
          applyMarkers(markers);
          return;
        }
        pendingMarkers = markers;
      },
      setPolygons(polygons) {
        if (ready) {
          applyPolygons(polygons);
          return;
        }
        pendingPolygons = polygons;
      },
      setClickHandler(handler) {
        clickHandler = handler;
      },
    };
    return instance;
  }
}
