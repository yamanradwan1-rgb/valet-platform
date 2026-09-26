import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  areaItem,
  liveMapBody,
  operationsReadReply,
  pointItem,
} from "./support/operations-fixtures";

const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

async function openCompanyMaps(page: Page) {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === livePath
      ? { body: liveMapBody() }
      : operationsReadReply(path),
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

test("R07 Maps matches measured desktop geometry and dark reference surfaces", async ({ page }) => {
  await openCompanyMaps(page);

  const title = page.getByRole("heading", { name: "Maps & Zones", level: 1 });
  const strip = page.getByTestId("map-reference-toolbar");
  const grid = page.getByTestId("map-reference-grid");
  const surface = page.getByRole("region", { name: "Operational coordinate map" });
  const panel = page.getByRole("complementary", { name: "Live Operations" });
  const canvas = page.getByTestId("coordinate-canvas");
  await page.waitForTimeout(250);

  const titleBox = await box(title);
  const stripBox = await box(strip);
  const gridBox = await box(grid);
  const surfaceBox = await box(surface);
  const panelBox = await box(panel);

  expect(titleBox.x).toBeCloseTo(292, 0);
  expect(titleBox.y).toBeCloseTo(96, 0);
  expect(titleBox.width).toBeCloseTo(1116, 0);
  expect(titleBox.height).toBeCloseTo(32, 0);
  expect(stripBox.x).toBeCloseTo(292, 0);
  expect(stripBox.y).toBeCloseTo(170, 0);
  expect(stripBox.width).toBeCloseTo(1116, 0);
  expect(stripBox.height).toBeCloseTo(64, 0);
  expect(gridBox.x).toBeCloseTo(292, 0);
  expect(gridBox.y).toBeCloseTo(254, 0);
  expect(gridBox.width).toBeCloseTo(1116, 0);
  expect(gridBox.height).toBeCloseTo(795.5, 0);
  expect(surfaceBox.width).toBeCloseTo(737.33, 0);
  expect(surfaceBox.height).toBeCloseTo(586, 0);
  expect(panelBox.x - (surfaceBox.x + surfaceBox.width)).toBeCloseTo(20, 0);
  expect(panelBox.width).toBeCloseTo(358.67, 0);
  expect(panelBox.height).toBeCloseTo(795.5, 0);

  await expect(strip).toHaveCSS("border-radius", "12px");
  await expect(surface).toHaveCSS("border-radius", "12px");
  await expect(panel).toHaveCSS("border-radius", "12px");
  await expect(canvas).toHaveCSS("background-color", "rgb(234, 239, 245)");
  await expect(page.getByText("Occupancy", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Capacity", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reservations", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(strip).toHaveCSS("background-color", "rgb(14, 22, 49)");
  await expect(strip).toHaveCSS("border-color", "rgb(23, 35, 70)");
  await expect(surface).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await expect(surface).toHaveCSS("border-color", "rgb(23, 35, 70)");
  await expect(panel).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await expect(panel).toHaveCSS("border-color", "rgb(23, 35, 70)");
  await expect(canvas).toHaveCSS("background-color", "rgb(10, 16, 32)");
});

test("R07 narrow and Arabic layouts stay usable without copying the reference overflow bug", async ({ page }) => {
  await openCompanyMaps(page);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "الخرائط والمناطق", level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 480, height: 900 });
  const strip = page.getByTestId("map-reference-toolbar");
  const surface = page.getByRole("region", { name: "خريطة الإحداثيات التشغيلية" });
  const panel = page.getByRole("complementary", { name: "العمليات المباشرة" });
  const html = await page.locator("html").evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  const stripBox = await box(strip);
  const surfaceBox = await box(surface);
  const panelBox = await box(panel);

  expect(html.scrollWidth).toBe(html.clientWidth);
  expect(stripBox.x).toBeCloseTo(20, 0);
  expect(stripBox.width).toBeCloseTo(440, 0);
  expect(surfaceBox.x).toBeCloseTo(20, 0);
  expect(surfaceBox.width).toBeCloseTo(440, 0);
  expect(panelBox.x).toBeCloseTo(20, 0);
  expect(panelBox.width).toBeCloseTo(440, 0);
  expect(panelBox.y - (surfaceBox.y + surfaceBox.height)).toBeCloseTo(20, 0);
});

test("R07 LM setup keeps reference panel geometry while showing only real setup facts", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === livePath) return { body: liveMapBody() };
      if (path === pointsPath) return { body: { points: [pointItem()] } };
      if (path === areasPath) return { body: { areas: [areaItem()] } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();

  const panel = page.getByRole("region", { name: "Map setup" });
  const panelBox = await box(panel);
  expect(panelBox.width).toBeCloseTo(358.67, 0);
  expect(panelBox.height).toBeGreaterThanOrEqual(795);
  await expect(panel.getByText("Entrance", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Purpose: Parking/u)).toBeVisible();
  await expect(panel.getByText("ENTRANCE", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("PARKING", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Add Point" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Add Area" })).toBeVisible();
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(panel).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const rtlPanel = page.getByRole("region", { name: "إعداد الخريطة" });
  await expect(rtlPanel.getByRole("heading", { name: "المناطق والمساحات" })).toBeVisible();
  await page.setViewportSize({ width: 480, height: 900 });
  const narrowPanel = await box(rtlPanel);
  expect(narrowPanel.x).toBeCloseTo(20, 0);
  expect(narrowPanel.width).toBeCloseTo(440, 0);
  const html = await page.locator("html").evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(html.scrollWidth).toBe(html.clientWidth);
});
