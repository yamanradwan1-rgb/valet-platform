import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { mockOperationsGoogleMap } from "./support/operations-google-map-mock";
import { areaItem, liveMapBody, pointItem } from "./support/operations-fixtures";

const configured = Boolean(
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() &&
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim(),
);
const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;
const lmSubscription = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/subscription`;

test.describe("Operations Google map authority", () => {
  test.skip(!configured, "fixture Google browser configuration is required");

  test("Company Admin renders live geography without Map Setup reads", async ({ page }) => {
    await mockOperationsGoogleMap(page);
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

    await expect.poll(() =>
      page.evaluate(() => window.operationsMapMock?.markerCreations ?? 0)
    ).toBe(2);
    expect(fixture.count(livePath)).toBeGreaterThan(0);
    expect(fixture.count(pointsPath)).toBe(0);
    expect(fixture.count(areasPath)).toBe(0);
    await expect(page.getByRole("button", { name: "Add Point" })).toHaveCount(0);
  });

  test("Supervisor renders live geography without Map Setup authority", async ({ page }) => {
    await mockOperationsGoogleMap(page);
    const fixture = new DashboardApiFixture({
      operationalContexts: [supervisorContext()],
      override: (path) => path === livePath ? { body: liveMapBody() } : undefined,
    });
    await fixture.install(page);
    await page.goto("/maps-zones");
    await signInOnCurrentPage(page, "supervisor@example.com");
    await page
      .getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` })
      .click();

    await expect.poll(() =>
      page.evaluate(() => window.operationsMapMock?.markerCreations ?? 0)
    ).toBe(2);
    expect(fixture.count(livePath)).toBeGreaterThan(0);
    expect(fixture.count(pointsPath)).toBe(0);
    expect(fixture.count(areasPath)).toBe(0);
    await expect(page.getByRole("button", { name: "Add Point" })).toHaveCount(0);
  });

  test("LM without Dashboard access stays Setup-only and never reads live map", async ({ page }) => {
    await mockOperationsGoogleMap(page);
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) => {
        if (path === lmSubscription) {
          return {
            body: {
              organizationId: ORG_A.organizationId,
              locationId: LOCATION_A.locationId,
              subscription: {
                planCode: "E2E",
                status: "ACTIVE",
                entitlements: {
                  dashboardAccess: false,
                  reportExports: false,
                  basicBranding: false,
                },
              },
            },
          };
        }
        if (path === pointsPath) return { body: { points: [pointItem()] } };
        if (path === areasPath) return { body: { areas: [areaItem()] } };
        return undefined;
      },
    });
    await fixture.install(page);
    await page.goto("/maps-zones");
    await signInOnCurrentPage(page, "manager@example.com");
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();

    await expect(page.getByTestId("lm-live-map-unavailable")).toBeVisible();
    await expect.poll(() =>
      page.evaluate(() => ({
        markers: window.operationsMapMock?.markerCreations ?? 0,
        polygons: window.operationsMapMock?.polygonCreations ?? 0,
      }))
    ).toEqual({ markers: 1, polygons: 1 });
    expect(fixture.count(livePath)).toBe(0);
    expect(fixture.count(pointsPath)).toBeGreaterThan(0);
    expect(fixture.count(areasPath)).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Add Point" })).toBeVisible();
  });
});
