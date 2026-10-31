import { afterEach, describe, expect, it, vi } from "vitest";
import type { GoogleMapsSdk } from "../../../../lib/maps/google-maps-sdk";
import { createHistoricalGoogleRuntime } from "./historical-google-runtime";

class FakeElement {
  className = "";
  type = "";
  textContent = "";
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, () => void>();
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  append() {}
  addEventListener(key: string, callback: () => void) {
    this.listeners.set(key, callback);
  }
  removeEventListener(key: string) {
    this.listeners.delete(key);
  }
  replaceChildren = vi.fn();
}
function fixture(failPolyline = false) {
  const maps: Array<{ options: Record<string, unknown>; zoom: number }> = [];
  const markers: Array<{ map: unknown; content: FakeElement }> = [];
  const lines: Array<{ options: Record<string, unknown>; map: unknown }> = [];
  const cleared: object[] = [];
  class Map {
    options: Record<string, unknown>;
    zoom = 17;
    constructor(_node: unknown, options: Record<string, unknown>) {
      this.options = options;
      maps.push(this);
    }
    setZoom(value: number) {
      this.zoom = value;
    }
    getZoom() {
      return this.zoom;
    }
    setCenter() {}
    fitBounds() {}
  }
  class Marker {
    map: unknown;
    content: FakeElement;
    constructor(options: { map: unknown; content: FakeElement }) {
      this.map = options.map;
      this.content = options.content;
      markers.push(this);
    }
  }
  class Polyline {
    map: unknown;
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      if (failPolyline) throw new Error("Provider failed");
      this.options = options;
      this.map = options.map;
      lines.push(this);
    }
    setMap(value: unknown) {
      this.map = value;
    }
  }
  const sdk = {
    Map,
    Polyline,
    marker: { AdvancedMarkerElement: Marker },
    LatLngBounds: class {
      extend() {
        return this;
      }
    },
    event: { clearInstanceListeners: (value: object) => cleared.push(value) },
  } as unknown as GoogleMapsSdk;
  const node = new FakeElement();
  vi.stubGlobal("document", { createElement: () => new FakeElement() });
  return { sdk, node, maps, markers, lines, cleared };
}
afterEach(() => vi.unstubAllGlobals());

describe("historical Google adapter (scripted provider)", () => {
  it("preserves all observed coordinates and bounds interactive markers; cleans every resource", () => {
    const f = fixture();
    const samples = Array.from({ length: 2000 }, (_, i) => ({
      latitude: 31 + i / 10000,
      longitude: 35 + i / 10000,
      capturedAt: "2026-10-31T12:00:00Z",
      trackingSessionId: "recording-a",
    }));
    const onSelect = vi.fn();
    const runtime = createHistoricalGoogleRuntime({
      ...f,
      node: f.node as unknown as HTMLElement,
      samples,
      mapId: "test-map",
      theme: "dark",
      markerClass: "route-marker",
      label: (i) => `Sample ${i}`,
      onSelect,
    });
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]!.options.path).toEqual(
      samples.map((s) => ({ lat: s.latitude, lng: s.longitude })),
    );
    expect(f.lines[0]!.options.geodesic).toBe(false);
    runtime.select(1500);
    expect(f.markers.length).toBeLessThanOrEqual(31);
    const button = f.markers.find(
      (m) => m.content.attributes.get("aria-label") === "Sample 1500",
    )!.content;
    button.listeners.get("click")!();
    expect(onSelect).toHaveBeenCalledWith(1500);
    const old = [...f.markers];
    runtime.select(0);
    expect(
      old.every((m) => m.map === null && m.content.listeners.size === 0),
    ).toBe(true);
    runtime.zoom(1);
    expect(f.maps[0]!.zoom).toBe(18);
    runtime.destroy();
    runtime.destroy();
    expect(
      f.markers.every((m) => m.map === null && m.content.listeners.size === 0),
    ).toBe(true);
    expect(f.lines[0]!.map).toBeNull();
    expect(f.cleared).toContain(f.maps[0]);
    expect(f.node.replaceChildren).toHaveBeenCalledOnce();
  });

  it("cleans an initialized map if provider line creation fails", () => {
    const f = fixture(true);
    expect(() =>
      createHistoricalGoogleRuntime({
        ...f,
        node: f.node as unknown as HTMLElement,
        samples: [
          {
            latitude: 1,
            longitude: 2,
            capturedAt: "2026-10-31T12:00:00Z",
            trackingSessionId: "recording",
          },
        ],
        mapId: "test",
        theme: "light",
        markerClass: "point",
        label: () => "Sample",
        onSelect: () => {},
      }),
    ).toThrow("Provider failed");
    expect(f.cleared).toContain(f.maps[0]);
    expect(f.node.replaceChildren).toHaveBeenCalledOnce();
  });
});
