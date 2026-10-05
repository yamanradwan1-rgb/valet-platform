import { expect, test } from "@playwright/test";
import { PresenceFixture, fillZone } from "./support/presence-fixtures";

// Explicit Maps JavaScript adapter mock. This is never real-provider evidence.
const sdk = `
window.presenceMapMock = { removed: 0, cleared: 0, radius: null, center: null, pin: null };
const state = window.presenceMapMock;
class MockMap {
  constructor(node, options) {
    state.options = options; state.center = options.center;
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Mock geographic click';
    button.onclick = () => this.handler?.({ latLng: { lat: () => 32, lng: () => 36 } });
    node.append(button);
  }
  panTo(center) { state.center = center; }
  addListener(name, handler) { this.handler = handler; return { remove: () => { this.handler = null; state.removed++; } }; }
}
class MockCircle {
  constructor(options) { state.radius = options.radius; }
  setMap(map) { state.circleAttached = Boolean(map); }
  setCenter(center) { state.circleCenter = center; }
  setRadius(radius) { state.radius = radius; }
}
class MockPin {
  constructor(options) { this.map = options.map; this.position = options.position; }
  set position(center) { state.pin = center; }
  set map(map) { state.pinAttached = Boolean(map); }
}
window.google = { maps: { Map: MockMap, Circle: MockCircle, marker: { AdvancedMarkerElement: MockPin }, event: { clearInstanceListeners: () => { state.cleared++; } } } };
`;
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
    };
  }
}
test("Google adapter mock: one draft, metric circle, unmirrored RTL and lifecycle disposal", async ({
  page,
}) => {
  await page.route(
    "https://maps.googleapis.com/maps/api/js?**",
    async (route) => {
      const callback = new URL(route.request().url()).searchParams.get(
        "callback",
      )!;
      expect(callback).toMatch(/^vayletAttendanceCallbacks\.ready\d+$/);
      await route.fulfill({
        contentType: "text/javascript",
        body: `${sdk}\n${callback}();`,
      });
    },
  );
  const f = new PresenceFixture();
  await f.open(page);
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  const dialog = await fillZone(page);
  await dialog
    .getByRole("button", { name: "Mock geographic click", exact: true })
    .click();
  await expect(dialog.getByLabel("Latitude", { exact: true })).toHaveValue(
    "32",
  );
  await expect(dialog.getByLabel("Longitude", { exact: true })).toHaveValue(
    "36",
  );
  await dialog.getByLabel("Latitude", { exact: true }).fill("31");
  await dialog.getByLabel("Longitude", { exact: true }).fill("35");
  await dialog.getByLabel("Radius (meters)", { exact: true }).fill("50.5");
  await expect
    .poll(() => page.evaluate(() => window.presenceMapMock.pin))
    .toEqual({ lat: 31, lng: 35 });
  expect(await page.evaluate(() => window.presenceMapMock.radius)).toBe(50.5);
  await page.evaluate(() => {
    localStorage.setItem("vaylet_dashboard_locale", "ar");
    window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
  });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page
      .getByRole("dialog")
      .getByLabel("الخريطة الجغرافية لمنطقة الحضور")
      .locator(".."),
  ).toHaveAttribute("dir", "ltr");
  expect(await page.evaluate(() => window.presenceMapMock.pin)).toEqual({
    lat: 31,
    lng: 35,
  });
  expect(f.writes).toHaveLength(0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.presenceMapMock.removed)).toBe(1);
  expect(await page.evaluate(() => window.presenceMapMock.cleared)).toBe(3);
  expect(await page.evaluate(() => window.presenceMapMock.pinAttached)).toBe(
    false,
  );
  expect(await page.evaluate(() => window.presenceMapMock.circleAttached)).toBe(
    false,
  );
});
