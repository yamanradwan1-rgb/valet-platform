import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { areaItem, liveMapBody, pointItem } from "./support/operations-fixtures";

const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("R07 pending LM setup read cannot repaint after logout", async ({ page }) => {
  const setupStarted = deferred();
  const releaseSetup = deferred();
  let setupStarts = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path === livePath) return { body: liveMapBody() };
      if (path === pointsPath || path === areasPath) {
        setupStarts += 1;
        if (setupStarts === 2) setupStarted.resolve();
        await releaseSetup.promise;
        return path === pointsPath
          ? { body: { points: [pointItem({ label: "LATE-SETUP-POINT" })] } }
          : { body: { areas: [areaItem({ label: "LATE-SETUP-AREA" })] } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await setupStarted.promise;

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  releaseSetup.resolve();
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("LATE-SETUP-POINT", { exact: true })).toHaveCount(0);
  await expect(page.getByText("LATE-SETUP-AREA", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("coordinate-canvas")).toHaveCount(0);
});

test("R07 pending setup write reconciles after same-scope mode switch without replay", async ({ page }) => {
  const mutationStarted = deferred();
  const releaseMutation = deferred();
  let pointWrites = 0;
  let points = [pointItem({ label: "Base point", code: "BASE" })];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path, request) => {
      if (path === livePath) return { body: liveMapBody() };
      if (path === pointsPath && request.method() === "GET") {
        return { body: { points } };
      }
      if (path === areasPath && request.method() === "GET") {
        return { body: { areas: [] } };
      }
      if (path === pointsPath && request.method() === "POST") {
        pointWrites += 1;
        mutationStarted.resolve();
        await releaseMutation.promise;
        const created = pointItem({
          ...(request.postDataJSON() as object),
          id: "77777777-7777-4777-8777-777777777799",
        });
        points = [...points, created];
        return { body: created };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
  await expect(page.getByText("Base point", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add Point" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Point" });
  await dialog.getByText("Code", { exact: true }).locator("..").getByRole("textbox").fill("MODE");
  await dialog.getByText("Label", { exact: true }).locator("..").getByRole("textbox").fill("Mode switch point");
  await dialog.getByText("Latitude", { exact: true }).locator("..").getByRole("textbox").fill("31.956");
  await dialog.getByText("Longitude", { exact: true }).locator("..").getByRole("textbox").fill("35.913");
  await dialog.getByRole("button", { name: "Save" }).click();
  await mutationStarted.promise;

  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Live Operations", exact: true }).click();
  const readsBeforeRelease = fixture.count(pointsPath);
  releaseMutation.resolve();
  await expect.poll(() => fixture.count(pointsPath)).toBeGreaterThan(readsBeforeRelease);

  await page.getByRole("button", { name: "Setup / Operational Areas", exact: true }).click();
  await expect(page.getByText("Mode switch point", { exact: true })).toBeVisible();
  expect(pointWrites).toBe(1);
});
