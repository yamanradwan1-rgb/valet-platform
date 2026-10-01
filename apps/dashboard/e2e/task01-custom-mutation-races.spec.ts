import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  enterPhysicalResources,
  openPhysicalResources,
  switchTopbarLocation,
} from "./support/keys-spots";
import { liveMapBody, pointItem } from "./support/operations-fixtures";

const keyPath = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/physical-resources/key-slots`;
const livePath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/live-operations-map`;
const pointsPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/points`;
const areasPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/areas`;
const at = "2026-09-29T03:00:00.000Z";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function key(code: string, keySlotId: string) {
  return { keySlotId, code, status: "ACTIVE", createdAt: at, updatedAt: at };
}

function liveBody(plate: string) {
  const body = liveMapBody();
  const item = body.items[0]!;
  return {
    ...body,
    items: [{ ...item, vehicle: { ...item.vehicle, plateNumber: plate } }],
  };
}

async function chooseLocation(page: Page, locationName: string) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

async function changeLocation(page: Page, locationName: string) {
  await switchTopbarLocation(page, locationName);
}

test("physical create A→B→A cannot reconcile into the newer A epoch", async ({
  page,
}) => {
  const started = deferred();
  const release = deferred();
  let committed = false;
  let posts = 0;
  const created = key(
    "A-EPOCH-CREATED",
    "55555555-5555-4555-8555-555555555556",
  );
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request) => {
      if (
        path === keyPath(LOCATION_A.locationId) &&
        request.method() === "POST"
      ) {
        posts += 1;
        started.resolve();
        await release.promise;
        committed = true;
        return { status: 201, body: created };
      }
      if (path === keyPath(LOCATION_A.locationId)) {
        return {
          body: { items: committed ? [created] : [], nextCursor: null },
        };
      }
      if (path === keyPath(LOCATION_B.locationId)) {
        return {
          body: {
            items: [key("B-01", "33333333-3333-4333-8333-333333333334")],
            nextCursor: null,
          },
        };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Code").fill("A-EPOCH-CREATED");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await started.promise;
  await dialog.press("Escape");

  await switchTopbarLocation(page, LOCATION_B.name);
  await openPhysicalResources(page);
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await switchTopbarLocation(page, LOCATION_A.name);
  await openPhysicalResources(page);
  await expect(page.getByText("A-EPOCH-CREATED", { exact: true })).toHaveCount(
    0,
  );
  const readsBeforeRelease = fixture.count(keyPath(LOCATION_A.locationId));

  release.resolve();
  await expect.poll(() => committed).toBe(true);
  await page.waitForLoadState("networkidle");
  expect(posts).toBe(1);
  expect(fixture.count(keyPath(LOCATION_A.locationId))).toBe(
    readsBeforeRelease,
  );
  await expect(page.getByText("A-EPOCH-CREATED", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("dialog", { name: "Physical resource label" }),
  ).toHaveCount(0);

  await switchTopbarLocation(page, LOCATION_B.name);
  await openPhysicalResources(page);
  await switchTopbarLocation(page, LOCATION_A.name);
  await openPhysicalResources(page);
  await expect(
    page.getByText("A-EPOCH-CREATED", { exact: true }),
  ).toBeVisible();
});

test("map point mutation A→B→A cannot refresh or close the newer A epoch", async ({
  page,
}) => {
  const started = deferred();
  const release = deferred();
  let writes = 0;
  let committed = false;
  const basePoint = pointItem({ label: "A base point", code: "A-BASE" });
  const createdPoint = pointItem({
    id: "77777777-7777-4777-8777-777777777721",
    label: "Old A created point",
    code: "A-NEW",
  });
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
    },
    override: async (path, request) => {
      if (path === livePath(LOCATION_A.locationId)) {
        return { body: liveBody("A-LIVE") };
      }
      if (path === livePath(LOCATION_B.locationId)) {
        return { body: liveBody("B-LIVE") };
      }
      if (
        path === pointsPath(LOCATION_A.locationId) &&
        request.method() === "GET"
      ) {
        return {
          body: {
            points: committed ? [basePoint, createdPoint] : [basePoint],
          },
        };
      }
      if (path === areasPath(LOCATION_A.locationId)) {
        return { body: { areas: [] } };
      }
      if (
        path === pointsPath(LOCATION_A.locationId) &&
        request.method() === "POST"
      ) {
        writes += 1;
        started.resolve();
        await release.promise;
        committed = true;
        return { body: createdPoint };
      }
      if (path === pointsPath(LOCATION_B.locationId)) {
        return {
          body: {
            points: [
              pointItem({
                label: "B authoritative point",
                code: "B-POINT",
              }),
            ],
          },
        };
      }
      if (path === areasPath(LOCATION_B.locationId)) {
        return { body: { areas: [] } };
      }
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
  const readsBeforeRelease = fixture.count(pointsPath(LOCATION_A.locationId));

  release.resolve();
  await expect.poll(() => committed).toBe(true);
  await page.waitForLoadState("networkidle");
  expect(writes).toBe(1);
  expect(fixture.count(pointsPath(LOCATION_A.locationId))).toBe(
    readsBeforeRelease,
  );
  await expect(
    page.getByText("Old A created point", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("A base point", { exact: true })).toBeVisible();
});
