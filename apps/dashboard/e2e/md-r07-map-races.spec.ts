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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function liveBody(plate: string, nextCursor: string | null = null) {
  const body = liveMapBody();
  const item = body.items[0]!;
  return {
    ...body,
    nextCursor,
    items: [{ ...item, vehicle: { ...item.vehicle, plateNumber: plate } }],
  };
}

async function chooseLocation(page: Page, locationName: string) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

async function changeLocation(page: Page, locationName: string) {
  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  const listbox = page.getByRole("listbox", { name: "Select location" });
  await expect(listbox).toBeVisible();
  await page.getByRole("option", { name: locationName }).click();
}

async function openMaps(page: Page, email = "admin@example.com") {
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, email);
  await chooseLocation(page, LOCATION_A.name);
}

for (const mode of ["success", "failure"] as const) {
  test(`R07 Maps A→B→A fences stale first-A ${mode}`, async ({ page }) => {
    const firstAStarted = deferred();
    const releaseFirstA = deferred();
    let aCalls = 0;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path) => {
        if (path === livePath(LOCATION_A.locationId)) {
          aCalls += 1;
          if (aCalls === 1) {
            firstAStarted.resolve();
            await releaseFirstA.promise;
            return mode === "success"
              ? { body: liveBody("STALE-FIRST-A") }
              : { status: 503, body: { code: "TEMPORARY", message: "stale live failure", requestId: "r07-stale" } };
          }
          return { body: liveBody("FRESH-FINAL-A") };
        }
        if (path === livePath(LOCATION_B.locationId)) {
          return { body: liveBody("MIDDLE-B") };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await openMaps(page);
    await firstAStarted.promise;

    await changeLocation(page, LOCATION_B.name);
    await expect(page.getByText("MIDDLE-B", { exact: true }).first()).toBeVisible();
    await changeLocation(page, LOCATION_A.name);
    await expect(page.getByText("FRESH-FINAL-A", { exact: true }).first()).toBeVisible();

    releaseFirstA.resolve();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("STALE-FIRST-A", { exact: true })).toHaveCount(0);
    await expect(page.getByText("stale live failure", { exact: true })).toHaveCount(0);
    await expect(page.getByText("FRESH-FINAL-A", { exact: true }).first()).toBeVisible();
  });
}

test("R07 live-map cursor from A never crosses into B", async ({ page }) => {
  const pageTwoStarted = deferred();
  const releasePageTwo = deferred();
  const seenB: Array<string | null> = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request) => {
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === livePath(LOCATION_A.locationId) && cursor === null) {
        return { body: liveBody("A-FIRST", "live_A_12345678") };
      }
      if (path === livePath(LOCATION_A.locationId)) {
        pageTwoStarted.resolve();
        await releasePageTwo.promise;
        return { body: liveBody("DELAYED-A-PAGE-2") };
      }
      if (path === livePath(LOCATION_B.locationId)) {
        seenB.push(cursor);
        return { body: liveBody("B-CURRENT") };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openMaps(page);
  await expect(page.getByText("A-FIRST", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await pageTwoStarted.promise;

  await changeLocation(page, LOCATION_B.name);
  await expect(page.getByText("B-CURRENT", { exact: true }).first()).toBeVisible();
  expect(seenB.length).toBeGreaterThan(0);
  expect(seenB.every((cursor) => cursor === null)).toBe(true);

  releasePageTwo.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("DELAYED-A-PAGE-2", { exact: true })).toHaveCount(0);
  await expect(page.getByText("B-CURRENT", { exact: true }).first()).toBeVisible();
});

test("R07 pending live-map read cannot repaint after logout", async ({ page }) => {
  const started = deferred();
  const release = deferred();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path !== livePath(LOCATION_A.locationId)) return undefined;
      started.resolve();
      await release.promise;
      return { body: liveBody("LATE-AFTER-LOGOUT") };
    },
  });
  await fixture.install(page);
  await openMaps(page);
  await started.promise;

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  release.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("LATE-AFTER-LOGOUT", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
});

test("R07 pending LM setup read is fenced by A→B scope replacement", async ({ page }) => {
  const setupAStarted = deferred();
  const releaseSetupA = deferred();
  let aStarts = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path) => {
      if (path === livePath(LOCATION_A.locationId)) return { body: liveBody("A-LIVE") };
      if (path === livePath(LOCATION_B.locationId)) return { body: liveBody("B-LIVE") };
      if (path === pointsPath(LOCATION_A.locationId) || path === areasPath(LOCATION_A.locationId)) {
        aStarts += 1;
        if (aStarts === 2) setupAStarted.resolve();
        await releaseSetupA.promise;
        return path === pointsPath(LOCATION_A.locationId)
          ? { body: { points: [pointItem({ label: "Stale A point", code: "A-POINT" })] } }
          : { body: { areas: [areaItem({ label: "Stale A area", code: "A-AREA" })] } };
      }
      if (path === pointsPath(LOCATION_B.locationId)) {
        return { body: { points: [pointItem({ label: "B authoritative point", code: "B-POINT" })] } };
      }
      if (path === areasPath(LOCATION_B.locationId)) {
        return { body: { areas: [areaItem({ label: "B authoritative area", code: "B-AREA" })] } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await openMaps(page, "manager@example.com");
  await setupAStarted.promise;

  await changeLocation(page, LOCATION_B.name);
  await page.getByRole("button", { name: "Setup / Operational Areas", exact: true }).click();
  await expect(page.getByText("B authoritative point", { exact: true })).toBeVisible();
  await expect(page.getByText("B authoritative area", { exact: true })).toBeVisible();
  const canvasTitles = page.getByTestId("coordinate-canvas").locator("title");
  await expect(canvasTitles.filter({ hasText: "B authoritative point" })).toHaveCount(1);

  releaseSetupA.resolve();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Stale A point", { exact: true })).toHaveCount(0);
  await expect(canvasTitles.filter({ hasText: "Stale A point" })).toHaveCount(0);
  await expect(page.getByText("B authoritative point", { exact: true })).toBeVisible();

  const settled = {
    live: fixture.count(livePath(LOCATION_B.locationId)),
    points: fixture.count(pointsPath(LOCATION_B.locationId)),
    areas: fixture.count(areasPath(LOCATION_B.locationId)),
  };
  expect(settled.live).toBeGreaterThanOrEqual(1);
  expect(settled.live).toBeLessThanOrEqual(2);
  expect(settled.points).toBeGreaterThanOrEqual(1);
  expect(settled.points).toBeLessThanOrEqual(2);
  expect(settled.areas).toBeGreaterThanOrEqual(1);
  expect(settled.areas).toBeLessThanOrEqual(2);
  await page.waitForTimeout(750);
  expect(fixture.count(livePath(LOCATION_B.locationId))).toBe(settled.live);
  expect(fixture.count(pointsPath(LOCATION_B.locationId))).toBe(settled.points);
  expect(fixture.count(areasPath(LOCATION_B.locationId))).toBe(settled.areas);
});

test("R07 pending LM point mutation does not reconcile into replacement scope", async ({ page }) => {
  const mutationStarted = deferred();
  const releaseMutation = deferred();
  let aPointReads = 0;
  let aAreaReads = 0;
  let aWrites = 0;
  let aPoints = [pointItem({ label: "A base point", code: "A-BASE" })];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request) => {
      if (path === livePath(LOCATION_A.locationId)) return { body: liveBody("A-LIVE") };
      if (path === livePath(LOCATION_B.locationId)) return { body: liveBody("B-LIVE") };
      if (path === pointsPath(LOCATION_A.locationId) && request.method() === "GET") {
        aPointReads += 1;
        return { body: { points: aPoints } };
      }
      if (path === areasPath(LOCATION_A.locationId) && request.method() === "GET") {
        aAreaReads += 1;
        return { body: { areas: [] } };
      }
      if (path === pointsPath(LOCATION_A.locationId) && request.method() === "POST") {
        aWrites += 1;
        mutationStarted.resolve();
        await releaseMutation.promise;
        const created = pointItem({
          ...(request.postDataJSON() as object),
          id: "77777777-7777-4777-8777-777777777720",
        });
        aPoints = [...aPoints, created];
        return { body: created };
      }
      if (path === pointsPath(LOCATION_B.locationId)) {
        return { body: { points: [pointItem({ label: "B authoritative point", code: "B-POINT" })] } };
      }
      if (path === areasPath(LOCATION_B.locationId)) return { body: { areas: [] } };
      return undefined;
    },
  });
  await fixture.install(page);
  await openMaps(page, "manager@example.com");
  await page.getByRole("button", { name: "Setup / Operational Areas", exact: true }).click();
  await expect(page.getByText("A base point", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Point" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Point" });
  await dialog.getByText("Code", { exact: true }).locator("..").getByRole("textbox").fill("A-NEW");
  await dialog.getByText("Label", { exact: true }).locator("..").getByRole("textbox").fill("Old A created point");
  await dialog.getByText("Latitude", { exact: true }).locator("..").getByRole("textbox").fill("31.956");
  await dialog.getByText("Longitude", { exact: true }).locator("..").getByRole("textbox").fill("35.913");
  await dialog.getByRole("button", { name: "Save" }).click();
  await mutationStarted.promise;
  const readsBeforeReplacement = { points: aPointReads, areas: aAreaReads };

  await dialog.getByRole("button", { name: "Close" }).click();
  await changeLocation(page, LOCATION_B.name);
  await page.getByRole("button", { name: "Setup / Operational Areas", exact: true }).click();
  await expect(page.getByText("B authoritative point", { exact: true })).toBeVisible();

  releaseMutation.resolve();
  await page.waitForLoadState("networkidle");
  expect(aWrites).toBe(1);
  expect(aPointReads).toBe(readsBeforeReplacement.points);
  expect(aAreaReads).toBe(readsBeforeReplacement.areas);
  await expect(page.getByText("Old A created point", { exact: true })).toHaveCount(0);
  await expect(page.getByText("B authoritative point", { exact: true })).toBeVisible();
});
