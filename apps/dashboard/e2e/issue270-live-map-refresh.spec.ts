import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { mockOperationsGoogleMap } from "./support/operations-google-map-mock";
import { liveMapBody } from "./support/operations-fixtures";

const configured = Boolean(
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() &&
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim(),
);
const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

function singleBody(
  freshness: "LIVE" | "STALE",
  latitude: number,
  longitude: number,
) {
  const item = liveMapBody().items[0]!;
  return {
    observedAt: "2026-10-07T00:00:00.000Z",
    nextCursor: null,
    items: [
      {
        ...item,
        position: {
          ...item.position!,
          freshness,
          latitude,
          longitude,
        },
      },
    ],
  };
}

async function openMaps(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

async function setVisibility(page: Page, value: "hidden" | "visible") {
  await page.evaluate((visibility) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);
}

test.describe("Issue #270 Live Operations refresh", () => {
  test.skip(!configured, "fixture Google browser configuration is required");

  test("polls after settlement, moves markers, stops hidden/SETUP and resumes immediately", async ({
    page,
  }) => {
    await page.clock.install();
    await mockOperationsGoogleMap(page);
    let reads = 0;
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) => {
        if (path === pointsPath) return { body: { points: [] } };
        if (path === areasPath) return { body: { areas: [] } };
        if (path !== livePath) return undefined;
        reads += 1;
        if (reads === 1) return { body: singleBody("LIVE", 31.9539, 35.9106) };
        if (reads === 2) return { body: singleBody("STALE", 31.9555, 35.9125) };
        return { body: { observedAt: "2026-10-07T00:00:20.000Z", nextCursor: null, items: [] } };
      },
    });
    await openMaps(page, fixture);

    await expect.poll(() => reads).toBe(1);
    await expect(page.getByText("Live", { exact: true }).last()).toBeVisible();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.operationsMapMock);
      return state.markers.find((marker) => marker.attached)?.position;
    }).toEqual({ lat: 31.9539, lng: 35.9106 });

    await page.evaluate(() => {
      window.operationsMapMock.center = { lat: 10, lng: 20 };
      window.operationsMapMock.zoom = 13;
    });
    await page.clock.fastForward(10_000);
    await expect.poll(() => reads).toBe(2);
    await expect(page.getByText("Last known", { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.operationsMapMock);
      return state.markers.find((marker) => marker.attached)?.position;
    }).toEqual({ lat: 31.9555, lng: 35.9125 });
    expect(await page.evaluate(() => window.operationsMapMock.center)).toEqual({
      lat: 10,
      lng: 20,
    });

    await setVisibility(page, "hidden");
    await page.clock.fastForward(60_000);
    expect(reads).toBe(2);
    await setVisibility(page, "visible");
    await expect.poll(() => reads).toBe(3);
    await expect(
      page.getByText(
        "No tracked Parking or Retrieval tasks are currently returned.",
        { exact: true },
      ).first(),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Setup / Operational Areas", exact: true })
      .click();
    await page.clock.fastForward(60_000);
    expect(reads).toBe(3);
    await page.getByRole("button", { name: "Live Operations", exact: true }).click();
    await expect.poll(() => reads).toBe(4);
  });

  test("empty success keeps the first real coordinate fit available, then preserves user camera", async ({
    page,
  }) => {
    await page.clock.install();
    await mockOperationsGoogleMap(page);
    let reads = 0;
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) => {
        if (path === pointsPath) return { body: { points: [] } };
        if (path === areasPath) return { body: { areas: [] } };
        if (path !== livePath) return undefined;
        reads += 1;
        if (reads === 1)
          return { body: { observedAt: "2026-10-07T00:00:00.000Z", nextCursor: null, items: [] } };
        if (reads === 2) return { body: singleBody("LIVE", 31.9539, 35.9106) };
        return { body: singleBody("LIVE", 31.956, 35.913) };
      },
    });
    await openMaps(page, fixture);
    await expect.poll(() => reads).toBe(1);
    expect(await page.evaluate(() => window.operationsMapMock.center)).toEqual({ lat: 0, lng: 0 });
    expect(await page.evaluate(() => window.operationsMapMock.zoom)).toBe(2);

    await page.clock.fastForward(10_000);
    await expect.poll(() => reads).toBe(2);
    await expect.poll(() => page.evaluate(() => window.operationsMapMock.center)).toEqual({
      lat: 31.9539,
      lng: 35.9106,
    });
    expect(await page.evaluate(() => window.operationsMapMock.zoom)).toBe(17);

    await page.evaluate(() => {
      window.operationsMapMock.center = { lat: 11, lng: 22 };
      window.operationsMapMock.zoom = 12;
    });
    await page.clock.fastForward(10_000);
    await expect.poll(() => reads).toBe(3);
    expect(await page.evaluate(() => window.operationsMapMock.center)).toEqual({ lat: 11, lng: 22 });
    expect(await page.evaluate(() => window.operationsMapMock.zoom)).toBe(12);
  });
});
