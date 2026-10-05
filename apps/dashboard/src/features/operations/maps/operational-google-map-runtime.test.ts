import { afterEach, describe, expect, it, vi } from "vitest";

import type { GoogleMapsSdk } from "../../../lib/maps/google-maps-sdk";
import type { OperationalMapModel } from "./operational-map-model";
import { createOperationalGoogleMapRuntime } from "./operational-google-map-runtime";

class FakeElement {
  className = "";
  dataset: Record<string, string> = {};
  title = "";
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

class FakeHost {
  clientWidth = 800;
  replacements = 0;

  replaceChildren() {
    this.replacements += 1;
  }
}

function createSdk() {
  const state = {
    maps: [] as FakeMap[],
    markers: [] as FakeMarker[],
    polygons: [] as FakePolygon[],
    cleared: [] as object[],
  };

  class FakeBounds {
    readonly points: Array<{ lat: number; lng: number }> = [];
    extend(value: { lat: number; lng: number }) { this.points.push(value); return this; }
    isEmpty() { return this.points.length === 0; }
  }

  class FakeMap {
    center: { lat: number; lng: number };
    zoom: number;
    readonly options: Record<string, unknown>;
    fitCalls = 0;

    constructor(_node: HTMLElement, options: Record<string, unknown>) {
      this.options = options;
      this.center = options.center as { lat: number; lng: number };
      this.zoom = options.zoom as number;
      state.maps.push(this);
    }

    panTo(center: { lat: number; lng: number }) { this.center = center; }
    setCenter(center: { lat: number; lng: number }) { this.center = center; }
    getCenter() {
      const center = this.center;
      return { lat: () => center.lat, lng: () => center.lng };
    }
    setZoom(zoom: number) { this.zoom = zoom; }
    getZoom() { return this.zoom; }
    fitBounds(bounds: FakeBounds) {
      this.fitCalls += 1;
      const [southWest, northEast] = bounds.points;
      if (!southWest || !northEast) return;
      this.center = {
        lat: (southWest.lat + northEast.lat) / 2,
        lng: (southWest.lng + northEast.lng) / 2,
      };
      this.zoom = 16;
    }
    addListener() { return { remove() {} }; }
  }

  class FakeMarker {
    map: FakeMap | null;
    position: { lat: number; lng: number } | null;
    content: Node | null;
    title: string;

    constructor(options: Record<string, unknown>) {
      this.map = (options.map as FakeMap | undefined) ?? null;
      this.position = (options.position as { lat: number; lng: number } | undefined) ?? null;
      this.content = (options.content as Node | undefined) ?? null;
      this.title = (options.title as string | undefined) ?? "";
      state.markers.push(this);
    }
  }

  class FakePolygon {
    map: FakeMap | null;
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.map = (options.map as FakeMap | undefined) ?? null;
      this.options = options;
      state.polygons.push(this);
    }

    setMap(map: FakeMap | null) { this.map = map; }
    setOptions(options: Record<string, unknown>) {
      this.options = { ...this.options, ...options };
    }
  }

  const sdk = {
    Map: FakeMap,
    Circle: class {},
    Polygon: FakePolygon,
    LatLngBounds: FakeBounds,
    marker: { AdvancedMarkerElement: FakeMarker },
    event: { clearInstanceListeners: (value: object) => state.cleared.push(value) },
  } as unknown as GoogleMapsSdk;

  return { sdk, state };
}

function model(overrides: Partial<OperationalMapModel> = {}): OperationalMapModel {
  return {
    liveMarkers: [{
      rendererKey: "task-a",
      position: { lat: 31.9539, lng: 35.9106 },
      label: "12-34567 · Parking · Live",
      state: "LIVE",
    }],
    pointMarkers: [],
    polygons: [],
    camera: {
      kind: "SINGLE",
      center: { lat: 31.9539, lng: 35.9106 },
      zoom: 17,
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("operational Google map runtime", () => {
  it("updates marker identity in place and detaches retired markers during sync", () => {
    vi.stubGlobal("document", {
      createElement: () => new FakeElement() as unknown as HTMLElement,
    });
    const { sdk, state } = createSdk();
    const host = new FakeHost();
    const runtime = createOperationalGoogleMapRuntime({
      sdk,
      node: host as unknown as HTMLElement,
      mapId: "map-id",
      theme: "light",
    });

    runtime.sync(model(), true);
    expect(state.markers).toHaveLength(1);
    const marker = state.markers[0]!;

    runtime.sync(model({
      liveMarkers: [{
        rendererKey: "task-a",
        position: { lat: 31.9555, lng: 35.9125 },
        label: "12-34567 · Parking · Last known",
        state: "STALE",
      }],
    }), false);

    expect(state.markers).toHaveLength(1);
    expect(state.markers[0]).toBe(marker);
    expect(marker.position).toEqual({ lat: 31.9555, lng: 35.9125 });
    expect(marker.title).toContain("Last known");

    runtime.sync(model({ liveMarkers: [] }), false);
    expect(marker.map).toBeNull();
    expect(state.cleared).toContain(marker);

    runtime.destroy();
    expect(state.cleared).toContain(state.maps[0]);
    expect(host.replacements).toBe(1);
  });

  it("restores a captured camera across a theme rebuild without refitting", () => {
    vi.stubGlobal("document", {
      createElement: () => new FakeElement() as unknown as HTMLElement,
    });
    const { sdk, state } = createSdk();
    const firstHost = new FakeHost();
    const first = createOperationalGoogleMapRuntime({
      sdk,
      node: firstHost as unknown as HTMLElement,
      mapId: "map-id",
      theme: "light",
    });
    first.sync(model(), true);
    state.maps[0]!.setCenter({ lat: 12, lng: 34 });
    state.maps[0]!.setZoom(14);
    const camera = first.snapshotCamera();
    first.destroy();

    const secondHost = new FakeHost();
    const second = createOperationalGoogleMapRuntime({
      sdk,
      node: secondHost as unknown as HTMLElement,
      mapId: "map-id",
      theme: "dark",
      camera,
    });
    second.sync(model(), false);

    const rebuilt = state.maps[1]!;
    expect(rebuilt.options.colorScheme).toBe("DARK");
    expect(rebuilt.center).toEqual({ lat: 12, lng: 34 });
    expect(rebuilt.zoom).toBe(14);
    expect(rebuilt.fitCalls).toBe(0);
  });
});
