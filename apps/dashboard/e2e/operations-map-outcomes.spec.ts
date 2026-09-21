import { expect, test } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { pointItem } from "./support/operations-fixtures";

const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

async function openLocationManagerMaps(page: import("@playwright/test").Page) {
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

test("manual map setup refresh failure is visible and never becomes an unhandled rejection", async ({ page }) => {
  let failReads = false;
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === pointsPath) {
        return failReads
          ? { status: 500, body: { code: "MAP_READ_FAILED", message: "map read failed", requestId: "read-fail" } }
          : { body: { points: [pointItem()] } };
      }
      if (path === areasPath) {
        return failReads
          ? { status: 500, body: { code: "MAP_READ_FAILED", message: "map read failed", requestId: "read-fail" } }
          : { body: { areas: [] } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openLocationManagerMaps(page);
  const setup = page.getByRole("region", { name: "Map setup" });
  await expect(setup.getByText("Entrance", { exact: true })).toBeVisible();
  failReads = true;
  await setup.getByRole("button", { name: "Refresh" }).click();
  await expect(setup.getByRole("alert")).toBeVisible();
  await page.waitForTimeout(100);
  expect(pageErrors).toEqual([]);
});

test("successful Save plus reload failure stays successful, closes once, and does not replay", async ({ page }) => {
  let writeSucceeded = false;
  let pointWrites = 0;
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === pointsPath && request.method() === "GET") {
        return writeSucceeded
          ? { status: 500, body: { code: "MAP_READ_FAILED", message: "refresh failed", requestId: "reload-fail" } }
          : { body: { points: [] } };
      }
      if (path === areasPath && request.method() === "GET") {
        return writeSucceeded
          ? { status: 500, body: { code: "MAP_READ_FAILED", message: "refresh failed", requestId: "reload-fail" } }
          : { body: { areas: [] } };
      }
      if (path === pointsPath && request.method() === "POST") {
        pointWrites += 1;
        writeSucceeded = true;
        return { body: pointItem({ ...(request.postDataJSON() as object) }), delayMs: 200 };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openLocationManagerMaps(page);
  await page.getByRole("button", { name: "Add Point" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Point" });
  await dialog.getByText("Code", { exact: true }).locator("..").getByRole("textbox").fill("P1");
  await dialog.getByText("Label", { exact: true }).locator("..").getByRole("textbox").fill("Point One");
  await dialog.getByText("Latitude", { exact: true }).locator("..").getByRole("textbox").fill("31.95");
  await dialog.getByText("Longitude", { exact: true }).locator("..").getByRole("textbox").fill("35.91");
  await dialog.getByRole("button", { name: "Save" }).dblclick();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/Save succeeded, but the latest map state could not be refreshed/u)).toBeVisible();
  await expect(page.getByText(/write outcome is uncertain/u)).toHaveCount(0);
  expect(pointWrites).toBe(1);
  expect(pageErrors).toEqual([]);
});
