import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  ISSUE232_KEY_ID,
  Issue232PhysicalState,
} from "./support/issue232-physical-resources";
import {
  enterPhysicalResources,
  openPhysicalResources,
  switchTopbarLocation,
} from "./support/keys-spots";

const at = "2026-09-30T18:00:00.000Z";
const keyPath = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/physical-resources/key-slots`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function key(code: string, keySlotId: string) {
  return {
    keySlotId,
    code,
    status: "ACTIVE",
    createdAt: at,
    updatedAt: at,
  };
}

async function switchWhileDialogOpen(
  page: Parameters<typeof switchTopbarLocation>[0],
  locationName: string,
) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  const option = page.getByRole("option", { name: locationName, exact: true });
  await expect(option).toBeVisible();
  await option.evaluate((element: HTMLElement) => element.click());
  await expect(page.locator(".topbar .location-context")).toContainText(
    locationName,
  );
}

test("first-A physical create cannot reconcile after A to B to A", async ({
  page,
}) => {
  const started = deferred();
  const release = deferred();
  const created = key("A-CREATED", "55555555-5555-4555-8555-555555555555");
  let createdA = false;
  let posts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request) => {
      if (
        path === keyPath(LOCATION_A.locationId) &&
        request.method() === "POST"
      ) {
        posts += 1;
        createdA = true;
        started.resolve();
        await release.promise;
        return { status: 201, body: created };
      }
      if (path === keyPath(LOCATION_A.locationId))
        return {
          body: { items: createdA ? [created] : [], nextCursor: null },
        };
      if (path === keyPath(LOCATION_B.locationId))
        return {
          body: {
            items: [key("B-01", "33333333-3333-4333-8333-333333333333")],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Code").fill("A-CREATED");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await started.promise;
  await switchWhileDialogOpen(page, LOCATION_B.name);
  await expect(dialog).toHaveCount(0);
  await openPhysicalResources(page);
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await switchTopbarLocation(page, LOCATION_A.name);
  await openPhysicalResources(page);
  await expect(page.getByText("A-CREATED", { exact: true })).toBeVisible();
  const readsBeforeRelease = fixture.count(keyPath(LOCATION_A.locationId));
  release.resolve();
  await page.waitForLoadState("networkidle");

  expect(posts).toBe(1);
  expect(fixture.count(keyPath(LOCATION_A.locationId))).toBe(
    readsBeforeRelease,
  );
  await expect(
    page.getByRole("dialog", { name: "Physical resource label" }),
  ).toHaveCount(0);
});

test("first-A label download cannot fire after A to B to A", async ({
  page,
}) => {
  const started = deferred();
  const release = deferred();
  const state = new Issue232PhysicalState(true);
  let labelReads = 0;
  let holdLabelRead = false;
  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path, request) => {
      if (path === keyPath(LOCATION_B.locationId))
        return {
          body: {
            items: [key("B-01", "99999999-9999-4999-8999-999999999999")],
            nextCursor: null,
          },
        };
      if (
        path === `${keyPath(LOCATION_A.locationId)}/${ISSUE232_KEY_ID}/label`
      ) {
        labelReads += 1;
        if (holdLabelRead) {
          started.resolve();
          await release.promise;
        }
      }
      return state.reply(path, request);
    },
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
  await page.getByRole("button", { name: "View label" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Physical resource label",
  });
  await expect(dialog.getByText("K-01", { exact: true })).toBeVisible();
  holdLabelRead = true;
  await dialog.getByRole("button", { name: "Download QR" }).click();
  await started.promise;
  await switchWhileDialogOpen(page, LOCATION_B.name);
  await expect(dialog).toHaveCount(0);
  await openPhysicalResources(page);
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await switchTopbarLocation(page, LOCATION_A.name);
  await openPhysicalResources(page);
  await expect(page.getByText("K-01", { exact: true })).toBeVisible();
  release.resolve();
  await page.waitForTimeout(200);

  expect(labelReads).toBeGreaterThanOrEqual(2);
  expect(downloaded).toBe(false);
  await expect(
    page.getByRole("dialog", { name: "Physical resource label" }),
  ).toHaveCount(0);
});
