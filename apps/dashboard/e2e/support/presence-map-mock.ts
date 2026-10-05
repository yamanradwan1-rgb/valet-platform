import { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    presenceMapMock: {
      removed: number;
      cleared: number;
      radius: number | null;
      center: { lat: number; lng: number };
      pin: { lat: number; lng: number };
      circleAttached: boolean;
      pinAttached: boolean;
      schemes: string[];
      retiredClick: (() => void) | null;
    };
  }
}

// Deliberately retains retired callbacks to test the application's fence too.
// Adapter mock only: never real Google runtime evidence.
const sdk = `
window.presenceMapMock = {
  removed: 0, cleared: 0, radius: null, center: null, pin: null,
  schemes: [], retiredClick: null
};
const state = window.presenceMapMock;
class MockMap {
  constructor(node, options) {
    state.schemes.push(options.colorScheme);
    state.center = options.center;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Mock geographic click';
    button.onclick = () => this.handler?.({
      latLng: { lat: () => 32, lng: () => 36 }
    });
    node.append(button);
  }
  panTo(center) { state.center = center; }
  addListener(name, handler) {
    this.handler = handler;
    return { remove: () => {
      state.retiredClick = () => handler({
        latLng: { lat: () => 80, lng: () => -80 }
      });
      this.handler = null;
      state.removed++;
    } };
  }
}
class MockCircle {
  constructor(options) { state.radius = options.radius; }
  setMap(map) { state.circleAttached = Boolean(map); }
  setCenter(center) { state.circleCenter = center; }
  setRadius(radius) { state.radius = radius; }
}
class MockPin {
  constructor(options) {
    this.map = options.map;
    this.position = options.position;
  }
  set position(center) { state.pin = center; }
  set map(map) { state.pinAttached = Boolean(map); }
}
window.google = { maps: {
  Map: MockMap, Circle: MockCircle,
  marker: { AdvancedMarkerElement: MockPin },
  event: { clearInstanceListeners: () => { state.cleared++; } }
} };
`;

export async function mockPresenceMap(page: Page) {
  const languages: string[] = [];
  await page.route(
    "https://maps.googleapis.com/maps/api/js?**",
    async (route) => {
      const params = new URL(route.request().url()).searchParams;
      const callback = params.get("callback")!;
      expect(callback).toMatch(/^vayletAttendanceCallbacks\.ready\d+$/);
      languages.push(params.get("language")!);
      await route.fulfill({
        contentType: "text/javascript",
        body: `${sdk}\n${callback}();`,
      });
    },
  );
  return languages;
}

export async function mockPresenceLocation(page: Page) {
  await page.addInitScript(() => {
    window.presenceGeo = { calls: [], success: null, error: null };
    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      window.presenceGeo.calls.push(options ?? {});
      window.presenceGeo.success = success;
      window.presenceGeo.error = error ?? null;
    };
    navigator.geolocation.watchPosition = () => {
      throw new Error("Tracking forbidden");
    };
  });
}
export async function deliverPresenceLocation(page: Page) {
  await page.evaluate(() =>
    window.presenceGeo.success?.({
      coords: {
        latitude: 31,
        longitude: 35,
        accuracy: 12,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    }),
  );
}
