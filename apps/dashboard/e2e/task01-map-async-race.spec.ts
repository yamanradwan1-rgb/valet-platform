import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { liveMapBody, pointItem } from "./support/operations-fixtures";

const livePath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/live-operations-map`;
const pointsPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/points`;
const areasPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/areas`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function chooseLocation(page: Page, locationName: string) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

async function changeLocation(page: Page, locationName: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  const listbox = page.getByRole("listbox", { name: "Select location" });
  await expect(listbox).toBeVisible();
  await page.getByRole("option", { name: locationName }).click();
}

test("first-A map setup write cannot reconcile after A to B to A", async ({
  page,
}) => {
  const started = deferred();
  const release = deferred();
  let aPointReads = 0;
  let aAreaReads = 0;
  let aWrites = 0;
  let aPoints = [pointItem({ label: "A base point", code: "A-BASE" })];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
    },
    override: async (path, request) => {
      if (
        path === livePath(LOCATION_A.locationId) ||
        path === livePath(LOCATION_B.locationId)
      )
        return { body: liveMapBody() };
      if (
        path === pointsPath(LOCATION_A.locationId) &&
        request.method() === "GET"
      ) {
        aPointReads += 1;
        return { body: { points: aPoints } };
      }
      if (
        path === areasPath(LOCATION_A.locationId) &&
        request.method() === "GET"
      ) {
        aAreaReads += 1;
        return { body: { areas: [] } };
      }
      if (
        path === pointsPath(LOCATION_A.locationId) &&
        request.method() === "POST"
      ) {
        aWrites += 1;
        started.resolve();
        await release.promise;
        const created = pointItem({
          ...(request.postDataJSON() as object),
          id: "77777777-7777-4777-8777-777777777720",
        });
        aPoints = [...aPoints, created];
        return { body: created };
      }
      if (path === pointsPath(LOCATION_B.locationId))
        return {
          body: {
            points: [
              pointItem({ label: "B authoritative point", code: "B-POINT" }),
            ],
          },
        };
      if (path === areasPath(LOCATION_B.locationId))
        return { body: { areas: [] } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await chooseLocation(page, LOCATION_A.name);
  await page
    .getByRole("button", { name: "Setup / Operational Areas", exact: true })
    .click();
  await expect(page.getByText("A base point", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Point" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Point" });
  await dialog
    .getByText("Code", { exact: true })
    .locator("..")
    .getByRole("textbox")
    .fill("A-NEW");
  await dialog
    .getByText("Label", { exact: true })
    .locator("..")
    .getByRole("textbox")
    .fill("Old A created point");
  await dialog
    .getByText("Latitude", { exact: true })
    .locator("..")
    .getByRole("textbox")
    .fill("31.956");
  await dialog
    .getByText("Longitude", { exact: true })
    .locator("..")
    .getByRole("textbox")
    .fill("35.913");
  await dialog.getByRole("button", { name: "Save" }).click();
  await started.promise;

  await dialog.getByRole("button", { name: "Close" }).click();
  await changeLocation(page, LOCATION_B.name);
  await page
    .getByRole("button", { name: "Setup / Operational Areas", exact: true })
    .click();
  await expect(
    page.getByText("B authoritative point", { exact: true }),
  ).toBeVisible();
  await changeLocation(page, LOCATION_A.name);
  await page
    .getByRole("button", { name: "Setup / Operational Areas", exact: true })
    .click();
  await expect(page.getByText("A base point", { exact: true })).toBeVisible();
  const readsBeforeRelease = { points: aPointReads, areas: aAreaReads };

  release.resolve();
  await page.waitForLoadState("networkidle");
  expect(aWrites).toBe(1);
  expect(aPointReads).toBe(readsBeforeRelease.points);
  expect(aAreaReads).toBe(readsBeforeRelease.areas);
  await expect(
    page.getByText("Old A created point", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("A base point", { exact: true })).toBeVisible();
});
