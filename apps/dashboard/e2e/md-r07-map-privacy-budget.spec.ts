import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { areaItem, liveMapBody, pointItem } from "./support/operations-fixtures";
import { persistentMatches } from "./support/persistent-storage";

const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;
const coordinateSentinel = "31.987654321";
const areaSentinel = "R07_AREA_SENTINEL_48127";
const pointSentinel = "R07_POINT_SENTINEL_48127";

test("R07 map data stays memory-only, request families settle, and logout removes protected DOM", async ({ page }) => {
  await page.addInitScript(() => {
    const original = URL.createObjectURL.bind(URL);
    (window as Window & { __r07ObjectUrls?: number }).__r07ObjectUrls = 0;
    URL.createObjectURL = (value: Blob | MediaSource) => {
      (window as Window & { __r07ObjectUrls?: number }).__r07ObjectUrls =
        ((window as Window & { __r07ObjectUrls?: number }).__r07ObjectUrls ?? 0) + 1;
      return original(value);
    };
  });
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === livePath) {
        const base = liveMapBody();
        const first = base.items[0]!;
        return {
          body: {
            ...base,
            items: [{
              ...first,
              position: {
                ...first.position!,
                latitude: Number(coordinateSentinel),
                areas: [{
                  mapAreaId: "77777777-7777-4777-8777-777777777799",
                  purpose: "PARKING",
                  code: "R07",
                  label: areaSentinel,
                  levelLabel: "L1",
                  parkingZoneId: null,
                }],
              },
            }],
          },
        };
      }
      if (path === pointsPath) return { body: { points: [pointItem({ label: pointSentinel })] } };
      if (path === areasPath) return { body: { areas: [areaItem({ label: areaSentinel })] } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  await page.getByRole("button", { name: "Setup / Operational Areas", exact: true }).click();
  await expect(page.getByText(areaSentinel, { exact: true })).toBeVisible();
  await expect(page.getByText(pointSentinel, { exact: true })).toBeVisible();
  await expect(page.getByTestId("coordinate-canvas")).toBeVisible();
  await expect.poll(() => fixture.count(livePath)).toBeGreaterThan(0);
  await expect.poll(() => fixture.count(pointsPath)).toBeGreaterThan(0);
  await expect.poll(() => fixture.count(areasPath)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const settled = {
    live: fixture.count(livePath),
    points: fixture.count(pointsPath),
    areas: fixture.count(areasPath),
  };
  expect(settled.live).toBeGreaterThanOrEqual(1);
  expect(settled.live).toBeLessThanOrEqual(2);
  expect(settled.points).toBeGreaterThanOrEqual(1);
  expect(settled.points).toBeLessThanOrEqual(2);
  expect(settled.areas).toBeGreaterThanOrEqual(1);
  expect(settled.areas).toBeLessThanOrEqual(2);
  await page.waitForTimeout(750);
  expect(fixture.count(livePath)).toBe(settled.live);
  expect(fixture.count(pointsPath)).toBe(settled.points);
  expect(fixture.count(areasPath)).toBe(settled.areas);

  for (const sentinel of [coordinateSentinel, areaSentinel, pointSentinel]) {
    const storage = await persistentMatches(page, sentinel);
    expect(storage).toEqual({ local: [], session: [], indexed: [], cache: [] });
  }
  expect(await page.evaluate(() =>
    (window as Window & { __r07ObjectUrls?: number }).__r07ObjectUrls ?? 0
  )).toBe(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("coordinate-canvas")).toHaveCount(0);
  const html = await page.locator("html").innerHTML();
  expect(html).not.toContain(areaSentinel);
  expect(html).not.toContain(pointSentinel);
  expect(html).not.toContain(coordinateSentinel);
});
