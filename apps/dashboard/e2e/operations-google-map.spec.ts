import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { mockOperationsGoogleMap } from "./support/operations-google-map-mock";
import {
  OP_IDS,
  areaItem,
  liveMapBody,
  pointItem,
} from "./support/operations-fixtures";

const configured = Boolean(
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() &&
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim(),
);
const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

function movedLiveBody() {
  const body = liveMapBody();
  return {
    ...body,
    nextCursor: "google_cursor_12345678",
    items: body.items.map((item, index) =>
      index === 0 && item.position
        ? { ...item, position: { ...item.position, latitude: 31.9555, longitude: 35.9125 } }
        : item,
    ),
  };
}

function pageTwoBody() {
  const item = liveMapBody().items[0]!;
  return {
    observedAt: "2026-09-21T12:01:00.000Z",
    nextCursor: null,
    items: [{
      ...item,
      taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      position: { ...item.position!, latitude: 31.965, longitude: 35.925 },
    }],
  };
}

function scopedLiveBody(plate: string, latitude: number, longitude: number) {
  const item = liveMapBody().items[0]!;
  return {
    observedAt: "2026-09-21T12:00:00.000Z",
    nextCursor: null,
    items: [{
      ...item,
      vehicle: { ...item.vehicle, plateNumber: plate },
      position: { ...item.position!, latitude, longitude },
    }],
  };
}

async function openLmMaps(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

async function changeLocationInShell(page: Page, name: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  const listbox = page.getByRole("listbox", { name: "Select location" });
  await expect(listbox).toBeVisible();
  await page.getByRole("option", { name }).click();
  await expect(page.locator(".topbar").getByText(name)).toBeVisible();
}

test.describe("Operations Google map adapter", () => {
  test.skip(!configured, "fixture Google browser configuration is required");

  test("renders exact live/setup geography, reconciles markers, refits epochs and preserves camera", async ({ page }) => {
    const google = await mockOperationsGoogleMap(page);
    let refreshed = false;
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) => {
        if (path === livePath) {
          const cursor = new URL(request.url()).searchParams.get("cursor");
          if (cursor) return { body: pageTwoBody() };
          return { body: refreshed ? movedLiveBody() : { ...liveMapBody(), nextCursor: "google_cursor_12345678" } };
        }
        if (path === pointsPath)
          return { body: { points: [pointItem({ active: false })] } };
        if (path === areasPath)
          return { body: { areas: [areaItem({ purpose: "RESTRICTED" })] } };
        return undefined;
      },
    });
    await openLmMaps(page, fixture);

    const map = page.getByTestId("operational-google-map");
    await expect(map).toBeVisible();
    await expect(page.getByTestId("coordinate-canvas")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.operationsMapMock.markerCreations)).toBe(3);
    await expect.poll(() => page.evaluate(() => window.operationsMapMock.polygonCreations)).toBe(1);

    const initial = await page.evaluate(() => window.operationsMapMock);
    const liveMarkers = initial.markers.filter((marker) => marker.className.includes("live-marker"));
    const pointMarkers = initial.markers.filter((marker) => marker.className.includes("point-marker"));
    expect(liveMarkers).toHaveLength(2);
    expect(liveMarkers.map((marker) => marker.position)).toEqual([
      { lat: 31.9539, lng: 35.9106 },
      { lat: 31.9542, lng: 35.911 },
    ]);
    expect(liveMarkers.map((marker) => marker.freshness)).toEqual(["LIVE", "STALE"]);
    expect(pointMarkers).toHaveLength(1);
    expect(pointMarkers[0]).toMatchObject({
      position: { lat: 31.9538, lng: 35.9104 },
      active: "false",
    });
    expect(initial.polygons[0]).toMatchObject({
      paths: [
        { lat: 31.9535, lng: 35.9101 },
        { lat: 31.954, lng: 35.9101 },
        { lat: 31.954, lng: 35.9108 },
      ],
      strokeColor: "#dc2626",
    });
    for (const marker of liveMarkers) {
      expect(marker.title).not.toContain(OP_IDS.task);
      expect(marker.title).not.toContain(OP_IDS.tracker);
      expect(marker.title).not.toContain(OP_IDS.session);
      expect(marker.title).not.toMatch(/31\.95|35\.91/u);
    }
    expect(initial.fitCalls).toBeGreaterThan(0);

    const liveInstances = liveMarkers.map((marker) => marker.instance);
    await page.evaluate(() => {
      window.operationsMapMock.center = { lat: 10, lng: 20 };
      window.operationsMapMock.zoom = 13;
    });
    refreshed = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.operationsMapMock);
      return state.markers
        .filter((marker) => marker.className.includes("live-marker"))[0]?.position;
    }).toEqual({ lat: 31.9555, lng: 35.9125 });
    const afterRefresh = await page.evaluate(() => window.operationsMapMock);
    expect(afterRefresh.markers.filter((marker) => marker.className.includes("live-marker")).map((marker) => marker.instance))
      .toEqual(liveInstances);
    expect(afterRefresh.center).toEqual({ lat: 10, lng: 20 });
    expect(afterRefresh.zoom).toBe(13);

    const fitBeforePage = afterRefresh.fitCalls;
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.operationsMapMock.fitCalls))
      .toBeGreaterThan(fitBeforePage);
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.operationsMapMock);
      return state.markers.filter((marker) => marker.className.includes("live-marker") && marker.attached).length;
    }).toBe(1);

    await page.evaluate(() => {
      window.operationsMapMock.center = { lat: 12, lng: 34 };
      window.operationsMapMock.zoom = 14;
    });
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.operationsMapMock.schemes)).toEqual(["LIGHT", "DARK"]);
    const afterTheme = await page.evaluate(() => window.operationsMapMock);
    expect(afterTheme.center).toEqual({ lat: 12, lng: 34 });
    expect(afterTheme.zoom).toBe(14);

    await page.getByRole("button", { name: "Language" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(map).toHaveAttribute("dir", "ltr");
    await expect(map).toContainText("تحتفظ تسميات مزود الخريطة باللغة المحملة لهذه الصفحة");
    expect(google.languages).toEqual(["en"]);
    expect(google.loads()).toBe(1);
  });

  test("network failure shows truthful CoordinateCanvas fallback and explicit retry recovers", async ({ page }) => {
    const google = await mockOperationsGoogleMap(page, { failFirst: true });
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) => path === livePath ? { body: liveMapBody() } : undefined,
    });
    await fixture.install(page);
    await page.goto("/maps-zones");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();

    const map = page.getByTestId("operational-google-map");
    await expect(map.getByText(/Google geographic map is unavailable/u)).toBeVisible();
    await expect(page.getByTestId("coordinate-canvas")).toBeVisible();
    expect(google.loads()).toBe(1);
    await map.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => google.loads()).toBe(2);
    await expect(page.getByTestId("coordinate-canvas")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.operationsMapMock?.markerCreations ?? 0)).toBe(2);
  });

  test("post-ready provider sync failure tears down overlays and shows the safe fallback", async ({ page }) => {
    await mockOperationsGoogleMap(page);
    let refreshed = false;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) => path === livePath
        ? { body: refreshed ? movedLiveBody() : liveMapBody() }
        : undefined,
    });
    await fixture.install(page);
    await page.goto("/maps-zones");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await expect.poll(() => page.evaluate(() => window.operationsMapMock?.markerCreations ?? 0)).toBe(2);

    await page.evaluate(() => {
      const host = window as Window & {
        google?: { maps?: { marker?: { AdvancedMarkerElement?: { prototype: object } } } };
      };
      const prototype = host.google?.maps?.marker?.AdvancedMarkerElement?.prototype;
      if (!prototype) throw new Error("Google marker fixture unavailable");
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "position");
      Object.defineProperty(prototype, "position", {
        configurable: true,
        get: descriptor?.get,
        set: () => { throw new Error("fixture sync failure"); },
      });
    });
    refreshed = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();

    const map = page.getByTestId("operational-google-map");
    await expect(map.getByText(/Google geographic map is unavailable/u)).toBeVisible();
    await expect(page.getByTestId("coordinate-canvas")).toBeVisible();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.operationsMapMock);
      return state.markers.filter((marker) => marker.attached).length;
    }).toBe(0);
  });
  test("late provider callback cannot publish retired A or B runtime after A→B→A", async ({ page }) => {
    const google = await mockOperationsGoogleMap(page, { delayReady: true });
    let visitedB = false;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: (path) => {
        if (path === `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`) {
          return { body: scopedLiveBody(visitedB ? "FINAL-A" : "FIRST-A", 31.9539, 35.9106) };
        }
        if (path === `/v1/staff/locations/${LOCATION_B.locationId}/live-operations-map`) {
          visitedB = true;
          return { body: scopedLiveBody("MIDDLE-B", 32.1, 36.1) };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await page.goto("/maps-zones");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await expect(page.getByText("FIRST-A", { exact: true }).first()).toBeVisible();
    await expect.poll(() => google.loads()).toBe(1);
    expect(await page.evaluate(() => window.operationsMapMock.markerCreations)).toBe(0);

    await changeLocationInShell(page, LOCATION_B.name);
    await expect(page.getByText("MIDDLE-B", { exact: true }).first()).toBeVisible();
    await changeLocationInShell(page, LOCATION_A.name);
    await expect(page.getByText("FINAL-A", { exact: true }).first()).toBeVisible();

    await google.releaseReady();
    await expect.poll(() => page.evaluate(() =>
      window.operationsMapMock.markers.filter((marker) => marker.attached).length
    )).toBe(1);
    const state = await page.evaluate(() => window.operationsMapMock);
    const attached = state.markers.filter((marker) => marker.attached);
    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatchObject({
      position: { lat: 31.9539, lng: 35.9106 },
    });
    expect(attached[0]!.title).toContain("FINAL-A");
    expect(attached[0]!.title).not.toContain("MIDDLE-B");
    expect(state.markers.some((marker) => /FIRST-A|MIDDLE-B/u.test(marker.title))).toBe(false);
    expect(state.schemes).toEqual(["LIGHT"]);
    expect(google.loads()).toBe(1);
  });
});
