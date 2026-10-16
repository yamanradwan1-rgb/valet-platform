import { expect, type Page } from "@playwright/test";

/** Test adapter for both the saved-zones overview and editable zone dialog.
 * Its geometry is synthetic: never label these screenshots as Google production tiles.
 */
const mockSdk = `
window.issue280MapQa = {
  maps: 0, markers: 0, circles: 0, center: null,
  zoom: null, radius: null, lastLanguage: null, cleared: 0
};
const telemetry = window.issue280MapQa;
class MapMock {
  constructor(node, options) {
    telemetry.maps++;
    telemetry.center = options.center;
    telemetry.zoom = options.zoom;
    this.center = options.center;
    this.zoom = options.zoom;
    const click = document.createElement('button');
    click.type = 'button';
    click.textContent = 'Mock geographic click';
    click.addEventListener('click', () => this.click?.({
      latLng: { lat: () => 32, lng: () => 36 }
    }));
    node.append(click);
  }
  panTo(center) { this.setCenter(center); }
  setCenter(center) { this.center = center; telemetry.center = center; }
  getCenter() {
    const center = this.center;
    return center && { lat: () => center.lat, lng: () => center.lng };
  }
  setZoom(value) { this.zoom = value; telemetry.zoom = value; }
  getZoom() { return this.zoom; }
  fitBounds(bounds) { this.fitted = [...bounds.centers]; }
  addListener(name, callback) {
    if (name === 'click') this.click = callback;
    return { remove: () => { this.click = null; } };
  }
}
class CircleMock {
  constructor(options) { telemetry.circles++; this.setRadius(options.radius); }
  setMap(map) { this.map = map; }
  setCenter(center) { this.center = center; }
  setRadius(radius) { this.radius = radius; telemetry.radius = radius; }
}
class PolygonMock {
  setMap(map) { this.map = map; }
  setOptions(options) { this.options = options; }
}
class BoundsMock {
  constructor() { this.centers = []; }
  extend(center) { this.centers.push(center); return this; }
  isEmpty() { return this.centers.length === 0; }
}
class MarkerMock {
  constructor(options) {
    telemetry.markers++;
    this.map = options.map;
    this.position = options.position;
    this.title = options.title;
  }
}
window.google = { maps: {
  Map: MapMock, Circle: CircleMock, Polygon: PolygonMock,
  LatLngBounds: BoundsMock,
  marker: { AdvancedMarkerElement: MarkerMock },
  event: { clearInstanceListeners: () => { telemetry.cleared++; } }
}};
`;

export async function mockIssue280Map(page: Page) {
  const languages: string[] = [];
  await page.route("https://maps.googleapis.com/maps/api/js?**", async (route) => {
    const callback = new URL(route.request().url()).searchParams.get("callback");
    const language = new URL(route.request().url()).searchParams.get("language");
    expect(callback).toMatch(/^vayletGoogleMapsCallbacks\.ready\d+$/u);
    expect(language).toMatch(/^(en|ar)$/u);
    languages.push(language!);
    await route.fulfill({
      contentType: "application/javascript",
      body: `${mockSdk}\nwindow.issue280MapQa.lastLanguage = ${JSON.stringify(language)};\n${callback}();`,
    });
  });
  return languages;
}
