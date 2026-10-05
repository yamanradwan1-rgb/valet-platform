import { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    releaseOperationsMapSdk?: () => void;
    operationsMapMock: {
      readonly schemes: string[];
      readonly mapIds: string[];
      markerCreations: number;
      polygonCreations: number;
      clearCalls: number;
      removedListeners: number;
      fitCalls: number;
      center: { lat: number; lng: number };
      zoom: number;
      markers: Array<{
        instance: number;
        position: { lat: number; lng: number } | null;
        attached: boolean;
        title: string;
        className: string;
        freshness: string | null;
        active: string | null;
      }>;
      polygons: Array<{
        instance: number;
        attached: boolean;
        paths: Array<{ lat: number; lng: number }>;
        strokeColor: string | null;
        fillColor: string | null;
      }>;
    };
  }
}

const sdk = String.raw`
window.operationsMapMock = {
  schemes: [], mapIds: [], markerCreations: 0, polygonCreations: 0,
  clearCalls: 0, removedListeners: 0, fitCalls: 0,
  center: { lat: 0, lng: 0 }, zoom: 2, markers: [], polygons: []
};
const state = window.operationsMapMock;
const literal = (center) => center && typeof center.lat === 'function'
  ? { lat: center.lat(), lng: center.lng() }
  : center;
class MockLatLngBounds {
  constructor() { this.points = []; }
  extend(center) { this.points.push(literal(center)); return this; }
  isEmpty() { return this.points.length === 0; }
}
class MockMap {
  constructor(node, options) {
    state.schemes.push(options.colorScheme);
    state.mapIds.push(options.mapId);
    state.center = literal(options.center ?? { lat: 0, lng: 0 });
    state.zoom = options.zoom ?? 2;
    const tile = document.createElement('div');
    tile.dataset.mockGoogleBaseMap = 'true';
    tile.style.cssText = 'position:absolute;inset:0;background:#dde7d8;';
    node.append(tile);
  }
  panTo(center) { state.center = literal(center); }
  setCenter(center) { state.center = literal(center); }
  getCenter() {
    return { lat: () => state.center.lat, lng: () => state.center.lng };
  }
  setZoom(zoom) { state.zoom = zoom; }
  getZoom() { return state.zoom; }
  fitBounds(bounds) {
    state.fitCalls++;
    const points = bounds.points ?? [];
    if (points.length) {
      state.center = {
        lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
        lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
      };
      state.zoom = 16;
    }
  }
  addListener(_name, _handler) {
    let removed = false;
    return { remove() {
      if (!removed) { removed = true; state.removedListeners++; }
    } };
  }
}
class MockPolygon {
  constructor(options) {
    this.instance = ++state.polygonCreations;
    this.attached = Boolean(options.map);
    this.options = options;
    state.polygons.push(this.snapshot());
  }
  setMap(map) { this.attached = Boolean(map); this.publish(); }
  setOptions(options) { this.options = { ...this.options, ...options }; this.publish(); }
  snapshot() {
    return {
      instance: this.instance, attached: this.attached,
      paths: (this.options.paths ?? []).map(literal),
      strokeColor: this.options.strokeColor ?? null,
      fillColor: this.options.fillColor ?? null,
    };
  }
  publish() {
    const index = state.polygons.findIndex((item) => item.instance === this.instance);
    state.polygons[index] = this.snapshot();
  }
}
class MockPin {
  constructor(options) {
    this.instance = ++state.markerCreations;
    this._map = options.map ?? null;
    this._position = literal(options.position ?? null);
    this._content = options.content ?? null;
    this._title = options.title ?? '';
    state.markers.push(this.snapshot());
  }
  set position(value) { this._position = literal(value); this.publish(); }
  get position() { return this._position; }
  set map(value) { this._map = value; this.publish(); }
  get map() { return this._map; }
  set content(value) { this._content = value; this.publish(); }
  get content() { return this._content; }
  set title(value) { this._title = value; this.publish(); }
  get title() { return this._title; }
  snapshot() {
    return {
      instance: this.instance, position: this._position, attached: Boolean(this._map),
      title: this._title, className: this._content?.className ?? '',
      freshness: this._content?.getAttribute?.('data-freshness') ?? null,
      active: this._content?.getAttribute?.('data-active') ?? null,
    };
  }
  publish() {
    const index = state.markers.findIndex((item) => item.instance === this.instance);
    state.markers[index] = this.snapshot();
  }
}
window.google = { maps: {
  Map: MockMap, Polygon: MockPolygon, LatLngBounds: MockLatLngBounds,
  Circle: class { setCenter() {} setRadius() {} setMap() {} },
  marker: { AdvancedMarkerElement: MockPin },
  event: { clearInstanceListeners: () => { state.clearCalls++; } }
} };
`;

export async function mockOperationsGoogleMap(
  page: Page,
  options: { readonly delayReady?: boolean; readonly failFirst?: boolean } = {},
) {
  const languages: string[] = [];
  let loads = 0;
  await page.route("https://maps.googleapis.com/maps/api/js?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const callback = params.get("callback")!;
    expect(callback).toMatch(/^vayletGoogleMapsCallbacks\.ready\d+$/);
    languages.push(params.get("language")!);
    loads += 1;
    if (options.failFirst === true && loads === 1) {
      await route.abort("failed");
      return;
    }
    const ready = options.delayReady === true
      ? `window.releaseOperationsMapSdk = () => { ${callback}(); delete window.releaseOperationsMapSdk; };`
      : `${callback}();`;
    await route.fulfill({
      contentType: "text/javascript",
      body: `${sdk}\n${ready}`,
    });
  });
  return {
    languages,
    loads: () => loads,
    releaseReady: () => page.evaluate(() => window.releaseOperationsMapSdk?.()),
  };
}
