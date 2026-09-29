import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { areaItem, liveMapBody, pointItem } from "./support/operations-fixtures";

const livePath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/live-operations-map`;
const pointsPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/points`;
const areasPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/areas`;
const zonesPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/parking-zones`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function zone(label: string, id: string) {
  return { code: label, label, parkingZoneId: id, status: "ACTIVE" as const };
}

function setupReply(path: string, locationId: string) {
  if (path === livePath(locationId)) return { body: liveMapBody() };
  if (path === pointsPath(locationId)) return { body: { points: [pointItem()] } };
  if (path === areasPath(locationId)) return { body: { areas: [areaItem()] } };
  return undefined;
}

async function chooseLocation(page: Page, name: string) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name }).click();
}

async function changeLocation(page: Page, name: string) {
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await chooseLocation(page, name);
}

async function openLmMaps(page: Page) {
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await chooseLocation(page, LOCATION_A.name);
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
}

async function openZoneSelector(page: Page) {
  await page.getByRole("button", { name: "Add Area" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Area" });
  await dialog.getByText("Advanced configuration", { exact: true }).click();
  return {
    dialog,
    select: dialog.getByRole("combobox", { name: "Parking Zone" }),
  };
}

for (const mode of ["success", "failure"] as const) {
  test(`MD231 ParkingZone A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const firstAStarted = deferred();
    const releaseFirstA = deferred();
    let aCalls = 0;
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path) => {
        const commonA = setupReply(path, LOCATION_A.locationId);
        if (commonA !== undefined) return commonA;
        const commonB = setupReply(path, LOCATION_B.locationId);
        if (commonB !== undefined) return commonB;
        if (path === zonesPath(LOCATION_A.locationId)) {
          aCalls += 1;
          if (aCalls === 1) {
            firstAStarted.resolve();
            await releaseFirstA.promise;
            return mode === "success"
              ? { body: { items: [zone("STALE-A-ZONE", "88888888-8888-4888-8888-888888888801")], nextCursor: null } }
              : { status: 503, body: { code: "TEMPORARY", message: "stale zone failure", requestId: "md231-stale-zone" } };
          }
          return { body: { items: [zone("FRESH-A-ZONE", "88888888-8888-4888-8888-888888888802")], nextCursor: null } };
        }
        if (path === zonesPath(LOCATION_B.locationId)) {
          return { body: { items: [zone("B-ZONE", "88888888-8888-4888-8888-888888888803")], nextCursor: null } };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await openLmMaps(page);
    await firstAStarted.promise;

    await changeLocation(page, LOCATION_B.name);
    await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
    await expect.poll(() => fixture.count(zonesPath(LOCATION_B.locationId))).toBeGreaterThan(0);
    await changeLocation(page, LOCATION_A.name);
    await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
    await expect.poll(() => aCalls).toBeGreaterThan(1);
    const current = await openZoneSelector(page);
    await expect(current.select.locator("option")).toContainText(["No Parking Zone", "FRESH-A-ZONE"]);

    releaseFirstA.resolve();
    await page.waitForLoadState("networkidle");
    await expect(current.select.locator("option")).not.toContainText(["STALE-A-ZONE"]);
    await expect(current.dialog.getByText("stale zone failure", { exact: true })).toHaveCount(0);
  });
}

test("MD231 pending ParkingZone read cannot repaint after logout", async ({ page }) => {
  const started = deferred();
  const release = deferred();
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      const common = setupReply(path, LOCATION_A.locationId);
      if (common !== undefined) return common;
      if (path !== zonesPath(LOCATION_A.locationId)) return undefined;
      started.resolve();
      await release.promise;
      return { body: { items: [zone("LATE-ZONE", "88888888-8888-4888-8888-888888888804")], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await openLmMaps(page);
  await started.promise;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("LATE-ZONE", { exact: true })).toHaveCount(0);
});

test("MD231 replacement session fences the prior ParkingZone result", async ({ page }) => {
  const started = deferred();
  const release = deferred();
  let calls = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      const common = setupReply(path, LOCATION_A.locationId);
      if (common !== undefined) return common;
      if (path !== zonesPath(LOCATION_A.locationId)) return undefined;
      calls += 1;
      if (calls === 1) {
        started.resolve();
        await release.promise;
        return { body: { items: [zone("OLD-SESSION-ZONE", "88888888-8888-4888-8888-888888888805")], nextCursor: null } };
      }
      return { body: { items: [zone("NEW-SESSION-ZONE", "88888888-8888-4888-8888-888888888806")], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await openLmMaps(page);
  await started.promise;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await signInOnCurrentPage(page, "replacement-manager@example.com");
  await chooseLocation(page, LOCATION_A.name);
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
  await expect.poll(() => calls).toBeGreaterThan(1);
  const current = await openZoneSelector(page);
  await expect(current.select.locator("option")).toContainText(["No Parking Zone", "NEW-SESSION-ZONE"]);
  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(current.select.locator("option")).not.toContainText(["OLD-SESSION-ZONE"]);
});
