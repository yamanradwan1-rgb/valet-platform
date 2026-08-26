import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", async () => {
  const double = await import("./openfreemap-maplibre-test-double");
  return { Map: double.FakeMap, Marker: double.FakeMarker };
});
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

import {
  asInteractiveMapInstance,
  type MapCenter,
  type MapMarkerDefinition,
  type MapPolygonDefinition,
} from "./map-provider";
import { OpenFreeMapLibreAdapter } from "./openfreemap-maplibre-adapter";
import {
  FakeMap,
  type FakeMapClickPayload,
  installFakeDocument,
  maplibreDoubleState,
  resetMaplibreDouble,
} from "./openfreemap-maplibre-test-double";

/**
 * Adapter lifecycle QA for the SETUP interactive-layer capability family
 * (D3-003).
 *
 * Proves on the real adapter that configured points/polygons render through
 * namespaced GeoJSON sources whose contents are fully replaced via setData,
 * that pre-load definitions are flushed exactly once, and that the single
 * map-click listener swaps feature handlers through a non-stacking
 * indirection while hit-testing ONLY the namespaced setup layers.
 * Live-marker behavior lives in openfreemap-maplibre-adapter-live-markers.test.ts.
 */

const LATITUDE = -12.345678;
const LONGITUDE = 98.765432;

// Namespaced layer/source ids are part of the collision-safety contract and
// are pinned here verbatim on purpose.
const MARKERS_SOURCE_ID = "dashboard-setup-markers";
const POLYGONS_SOURCE_ID = "dashboard-setup-polygons";
const MARKER_LAYER_ID = "dashboard-setup-marker-circle";
const POLYGON_FILL_LAYER_ID = "dashboard-setup-polygon-fill";
const POLYGON_LINE_LAYER_ID = "dashboard-setup-polygon-line";

function coordinate(latitude: number, longitude: number): MapCenter {
  return { latitude, longitude };
}

function markerDef(id: string): MapMarkerDefinition {
  return { color: "#176bff", id, latitude: LATITUDE, longitude: LONGITUDE };
}

interface VertexInput {
  readonly latitude: number;
  readonly longitude: number;
}

function polygonDef(id: string, vertices: VertexInput[]): MapPolygonDefinition {
  return {
    color: "#d95c63",
    id,
    selected: false,
    vertices: vertices.map((vertex) => coordinate(vertex.latitude, vertex.longitude)),
  };
}

function clickPayload(): FakeMapClickPayload {
  // Asymmetric on purpose: a lat/lng swap can never pass these assertions.
  return {
    lngLat: { lat: LATITUDE, lng: LONGITUDE },
    originalEvent: undefined,
    point: undefined,
  };
}

function container(): HTMLElement {
  return document.createElement("div") as unknown as HTMLElement;
}

async function createInteractive(): Promise<{
  interactive: NonNullable<ReturnType<typeof asInteractiveMapInstance>>;
  map: FakeMap;
}> {
  const instance = await new OpenFreeMapLibreAdapter().createMap(container(), {
    center: coordinate(LATITUDE, LONGITUDE),
    zoom: 15.25,
  });
  const map = maplibreDoubleState.maps.at(-1) as FakeMap;
  const interactive = asInteractiveMapInstance(instance);
  if (interactive === null) throw new Error("adapter lost its setup capability");
  return { interactive, map };
}

beforeEach(() => {
  resetMaplibreDouble();
  installFakeDocument();
});

describe("namespaced setup sources", () => {
  it("installs exactly the namespaced sources and layers once on load", async () => {
    const { map } = await createInteractive();
    expect(map.sources.size).toBe(0);
    map.emit("load");
    expect([...map.sources.keys()].sort()).toEqual(
      [MARKERS_SOURCE_ID, POLYGONS_SOURCE_ID].sort(),
    );
    expect(map.addedLayers.map((layer) => layer.id).sort()).toEqual(
      [MARKER_LAYER_ID, POLYGON_FILL_LAYER_ID, POLYGON_LINE_LAYER_ID].sort(),
    );
  });

  it("flushes definitions queued before load exactly once when ready", async () => {
    const { interactive, map } = await createInteractive();
    interactive.setMarkers([markerDef("pt-1")]);
    interactive.setPolygons([
      polygonDef("ar-1", [
        { latitude: LATITUDE, longitude: LONGITUDE },
        { latitude: LATITUDE + 0.01, longitude: LONGITUDE + 0.01 },
        { latitude: LATITUDE + 0.02, longitude: LONGITUDE },
      ]),
    ]);
    for (const source of map.sources.values()) {
      expect(source.setDataCalls).toHaveLength(0); // nothing before ready
    }
    map.emit("load");
    const markers = map.sources.get(MARKERS_SOURCE_ID)!;
    const polygons = map.sources.get(POLYGONS_SOURCE_ID)!;
    expect(markers.setDataCalls).toHaveLength(1);
    expect(polygons.setDataCalls).toHaveLength(1);
  });

  it("fully replaces the marker FeatureCollection on every setMarkers call", async () => {
    const { interactive, map } = await createInteractive();
    map.emit("load");
    const markers = map.sources.get(MARKERS_SOURCE_ID)!;
    // Load itself performs one empty flush; every setMarkers then swaps the
    // ENTIRE collection through exactly one more setData.
    const baseline = markers.setDataCalls.length;
    interactive.setMarkers([markerDef("pt-1"), markerDef("pt-2")]);
    const first = markers.data as {
      features: Array<{ geometry: { coordinates: number[] }; properties: { id: string } }>;
    };
    expect(first.features.map((feature) => feature.properties.id)).toEqual([
      "pt-1",
      "pt-2",
    ]);
    // Asymmetric order proof at the adapter boundary: [longitude, latitude].
    expect(first.features[0]?.geometry.coordinates).toEqual([LONGITUDE, LATITUDE]);
    interactive.setMarkers([markerDef("pt-9")]);
    expect(markers.setDataCalls).toHaveLength(baseline + 2);
    const second = markers.data as typeof first;
    expect(second.features.map((feature) => feature.properties.id)).toEqual(["pt-9"]);
  });

  it("fully replaces polygons and closes rings render-only", async () => {
    const { interactive, map } = await createInteractive();
    map.emit("load");
    const polygons = map.sources.get(POLYGONS_SOURCE_ID)!;
    const baseline = polygons.setDataCalls.length;
    const storedVertices = [
      { latitude: LATITUDE, longitude: LONGITUDE },
      { latitude: LATITUDE + 0.01, longitude: LONGITUDE + 0.01 },
      { latitude: LATITUDE + 0.02, longitude: LONGITUDE },
    ];
    const frozen = [...storedVertices];
    interactive.setPolygons([polygonDef("ar-1", storedVertices)]);
    const rendered = polygons.data as {
      features: Array<{ geometry: { coordinates: [Array<[number, number]>] } }>;
    };
    const ring = rendered.features[0]?.geometry.coordinates[0];
    expect(ring).toHaveLength(4);
    expect(ring?.[3]).toEqual(ring?.[0]);
    expect(ring?.[0]).toEqual([LONGITUDE, LATITUDE]);
    // Closure exists only inside the rendered copy; stored data untouched.
    expect(storedVertices).toEqual(frozen);
    expect(storedVertices).toHaveLength(3);

    interactive.setPolygons([
      polygonDef("ar-2", [
        { latitude: LATITUDE, longitude: LONGITUDE },
        { latitude: LATITUDE + 0.03, longitude: LONGITUDE + 0.03 },
        { latitude: LATITUDE + 0.04, longitude: LONGITUDE },
      ]),
    ]);
    expect(polygons.setDataCalls).toHaveLength(baseline + 2);
    const replaced = polygons.data as typeof rendered;
    expect(replaced.features[0]?.geometry.coordinates[0]).toHaveLength(4);
    expect(storedVertices.every((vertex) => frozen.includes(vertex))).toBe(true);
  });
});

describe("single map-click indirection", () => {
  it("swaps handlers without stacking callbacks", async () => {
    const { interactive, map } = await createInteractive();
    map.emit("load");
    const first = vi.fn();
    const second = vi.fn();
    interactive.setClickHandler(first);
    map.emit("click", clickPayload());
    expect(first).toHaveBeenCalledTimes(1);
    interactive.setClickHandler(second);
    map.emit("click", clickPayload());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    interactive.setClickHandler(null);
    map.emit("click", clickPayload());
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("delivers provider clicks as domain coordinates with asymmetric proof", async () => {
    const { interactive, map } = await createInteractive();
    map.emit("load");
    const handler = vi.fn();
    interactive.setClickHandler(handler);
    map.emit("click", clickPayload());
    const click = handler.mock.calls[0]?.[0] as { coordinate: MapCenter };
    expect(click.coordinate.latitude).toBe(LATITUDE);
    expect(click.coordinate.longitude).toBe(LONGITUDE);
    expect(click.coordinate.latitude).not.toBe(LONGITUDE);
  });

  it("reports hit-tested features from the namespaced layers only", async () => {
    const { interactive, map } = await createInteractive();
    map.emit("load");
    const handler = vi.fn();
    interactive.setClickHandler(handler);
    map.queuedHits = [
      { layer: { id: POLYGON_FILL_LAYER_ID }, properties: { id: "ar-7" } },
      { layer: { id: MARKER_LAYER_ID }, properties: { id: "pt-7" } },
    ];
    map.emit("click", clickPayload());
    const payload = handler.mock.calls[0]?.[0] as {
      markerId: string | null;
      polygonId: string | null;
    };
    expect(payload.markerId).toBe("pt-7");
    expect(payload.polygonId).toBe("ar-7");
    expect(map.lastQueriedLayers).toEqual([MARKER_LAYER_ID, POLYGON_FILL_LAYER_ID]);

    // The polygon OUTLINE layer is presentation-only: hits on it never
    // fabricate an entity id.
    handler.mockClear();
    map.queuedHits = [{ layer: { id: POLYGON_LINE_LAYER_ID }, properties: { id: "x" } }];
    map.emit("click", clickPayload());
    const outlineOnly = handler.mock.calls[0]?.[0] as typeof payload;
    expect(outlineOnly.markerId).toBeNull();
    expect(outlineOnly.polygonId).toBeNull();

    handler.mockClear();
    map.queuedHits = [];
    map.emit("click", clickPayload());
    const emptySurface = handler.mock.calls[0]?.[0] as typeof payload;
    expect(emptySurface.markerId).toBeNull();
    expect(emptySurface.polygonId).toBeNull();
  });
});
