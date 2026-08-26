import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", async () => {
  const double = await import("./openfreemap-maplibre-test-double");
  return { Map: double.FakeMap, Marker: double.FakeMarker };
});
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

import { OPENFREEMAP_LIBERTY_STYLE_URL } from "../app-config";
import {
  supportsMarkers,
  type MapInitOptions,
  type MapMarkerDescriptor,
} from "./map-provider";
import { OpenFreeMapLibreAdapter } from "./openfreemap-maplibre-adapter";
import {
  type FakeClickEvent,
  FakeElement,
  FakeMap,
  installFakeDocument,
  maplibreDoubleState,
  resetMaplibreDouble,
} from "./openfreemap-maplibre-test-double";

/**
 * Adapter lifecycle QA for the LIVE-marker capability family (D3-003).
 *
 * Proves on the real adapter that one MapLibre/OpenFreeMap instance serves
 * BOTH runtime capability probes, that live DOM markers replace without
 * accumulating, that accessible select listeners never stack, and that
 * destroy is idempotent and fully tears down provider resources.
 * Setup-layer behavior lives in openfreemap-maplibre-adapter-setup-layers.test.ts.
 */

const LATITUDE = 32.562703;
const LONGITUDE = 35.880055;
const ZOOM = 15.25;

function descriptor(id: string): MapMarkerDescriptor {
  return {
    ariaLabel: `PARKING · 34-B-7890 · LIVE (${id})`,
    glyph: "P",
    id,
    latitude: LATITUDE,
    longitude: LONGITUDE,
    selected: false,
    tone: "positive",
  };
}

function initOptions(onSelectMarker?: (id: string) => void): MapInitOptions {
  return {
    center: { latitude: LATITUDE, longitude: LONGITUDE },
    zoom: ZOOM,
    ...(onSelectMarker === undefined ? {} : { onSelectMarker }),
  };
}

function container(): HTMLElement {
  return document.createElement("div") as unknown as HTMLElement;
}

async function createReadyInstance(
  onSelectMarker?: (id: string) => void,
): Promise<{ instance: Awaited<ReturnType<OpenFreeMapLibreAdapter["createMap"]>>; map: FakeMap }> {
  const instance = await new OpenFreeMapLibreAdapter().createMap(
    container(),
    initOptions(onSelectMarker),
  );
  const map = maplibreDoubleState.maps.at(-1) as FakeMap;
  map.emit("load");
  return { instance, map };
}

beforeEach(() => {
  resetMaplibreDouble();
  installFakeDocument();
});

describe("dual-capability surface", () => {
  it("satisfies BOTH runtime capability probes on ONE adapter instance", async () => {
    const { instance } = await createReadyInstance();
    expect(supportsMarkers(instance)).toBe(true);
    expect(
      typeof (instance as { setMarkers?: unknown }).setMarkers,
    ).toBe("function");
  });

  it("stays key-free and identifies itself as the MapLibre/OpenFreeMap stack", () => {
    const adapter = new OpenFreeMapLibreAdapter();
    expect(adapter.name).toBe("maplibre-openfreemap");
    expect(adapter.requiresApiKey).toBe(false);
  });

  it("converts the domain init center at the single [longitude, latitude] boundary", async () => {
    await createReadyInstance();
    const map = maplibreDoubleState.maps.at(-1) as FakeMap;
    expect(map.options.center).toEqual([LONGITUDE, LATITUDE]);
    expect(map.options.style).toBe(OPENFREEMAP_LIBERTY_STYLE_URL);
    expect(map.options.zoom).toBe(ZOOM);
  });

  it("propagates initialization failure instead of resolving a broken map", async () => {
    maplibreDoubleState.failMapConstruction = true;
    await expect(
      new OpenFreeMapLibreAdapter().createMap(container(), initOptions()),
    ).rejects.toThrow("MAP_INIT_FAILED");
  });
});

describe("live DOM marker lifecycle", () => {
  it("positions markers with GeoJSON order [longitude, latitude]", async () => {
    const { instance } = await createReadyInstance();
    instance.replaceMarkers([descriptor("m1")]);
    const marker = maplibreDoubleState.markers[0]!;
    expect(marker.lngLat).toEqual([LONGITUDE, LATITUDE]);
  });

  it("renders accessible button elements from backend facts only", async () => {
    const { instance } = await createReadyInstance();
    instance.replaceMarkers([descriptor("m1")]);
    const element = maplibreDoubleState.markers[0]!.element as FakeElement;
    expect(element.getAttribute("aria-label")).toBe(
      "PARKING · 34-B-7890 · LIVE (m1)",
    );
    expect(element.classList.contains("is-live")).toBe(true);
    // The glyph is decorative; the name carries the semantics.
    expect(element.children[0]?.getAttribute("aria-hidden")).toBe("true");
  });

  it("replaces the full marker set atomically so removed items disappear", async () => {
    const { instance } = await createReadyInstance();
    instance.replaceMarkers([descriptor("m1"), descriptor("m2")]);
    const firstGeneration = [...maplibreDoubleState.markers];
    expect(firstGeneration).toHaveLength(2);
    instance.replaceMarkers([
      descriptor("m2"),
      descriptor("m3"),
      descriptor("m4"),
    ]);
    // Every first-generation element was detached exactly once — including
    // the id that survived — so nothing can accumulate across refreshes.
    for (const marker of firstGeneration) {
      expect(marker.removedCount).toBe(1);
    }
    // Only the new generation exists beyond the replaced one.
    expect(maplibreDoubleState.markers.slice(firstGeneration.length)).toHaveLength(
      3,
    );
  });

  it("focuses only current ids and reports unknown ones honestly", async () => {
    const { instance, map } = await createReadyInstance();
    instance.replaceMarkers([descriptor("m1")]);
    instance.replaceMarkers([descriptor("m2")]);
    expect(instance.focusMarker("m1")).toBe(false); // replaced away
    expect(instance.focusMarker("never-existed")).toBe(false);
    expect(map.pannedTo).toBeNull();
    expect(instance.focusMarker("m2")).toBe(true);
    expect(map.pannedTo).toEqual([LONGITUDE, LATITUDE]);
  });

  it("keeps exactly one accessible listener per marker and never stacks them", async () => {
    const selected: string[] = [];
    const { instance } = await createReadyInstance((id) => selected.push(id));
    instance.replaceMarkers([descriptor("m1"), descriptor("m2")]);
    instance.replaceMarkers([descriptor("m3")]);
    for (const marker of maplibreDoubleState.markers) {
      const element = marker.element as FakeElement;
      expect(element.listeners.get("click")).toHaveLength(1);
    }
    (maplibreDoubleState.markers[2]!.element as FakeElement).clickForTest();
    expect(selected).toEqual(["m3"]);
    // Detached first-generation elements are unreachable for users (the
    // atomic-replacement test above pins their removal); focus also refuses
    // them, so no interaction path can resurrect a replaced id.
    expect(instance.focusMarker("m1")).toBe(false);
  });

  it("stops a live-marker click from reaching the setup map-click capability", async () => {
    const { instance, map } = await createReadyInstance((id) => void id);
    const setupClick = vi.fn();
    instance.setClickHandler(setupClick);
    instance.replaceMarkers([descriptor("m1")]);
    const element = maplibreDoubleState.markers[0]!.element as FakeElement;
    const dispatched: FakeClickEvent = element.clickForTest();
    expect(dispatched.stopPropagationCalled).toBe(true);
    // The collision guard: a live marker tap must not be misread as an
    // empty-map setup click even on a shared instance.
    expect(setupClick).not.toHaveBeenCalled();
    expect(map.lastQueriedLayers).toBeNull();
  });
});

describe("destroy teardown", () => {
  it("is idempotent, detaches every live DOM marker and calls map.remove once", async () => {
    const { instance, map } = await createReadyInstance();
    instance.replaceMarkers([descriptor("m1"), descriptor("m2")]);
    instance.destroy();
    expect(maplibreDoubleState.markers.map((m) => m.removedCount)).toEqual([
      1, 1,
    ]);
    expect(map.removedCount).toBe(1);
    instance.destroy();
    expect(map.removedCount).toBe(1);
    expect(maplibreDoubleState.markers[0]?.removedCount).toBe(1);
  });

  it("makes both capability families safe no-ops after destroy", async () => {
    const { instance, map } = await createReadyInstance();
    instance.destroy();
    expect(() =>
      instance.replaceMarkers([descriptor("late")]),
    ).not.toThrow();
    expect(maplibreDoubleState.markers).toHaveLength(0);
    expect(instance.focusMarker("late")).toBe(false);
    expect(() => instance.setMarkers([])).not.toThrow();
    expect(() => instance.setPolygons([])).not.toThrow();
    const lateHandler = vi.fn();
    instance.setClickHandler(lateHandler);
    map.emit("click", {
      lngLat: { lat: LATITUDE, lng: LONGITUDE },
      originalEvent: undefined,
      point: undefined,
    });
    expect(lateHandler).not.toHaveBeenCalled();
  });
});
