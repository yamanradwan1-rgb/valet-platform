import { expect, test, type Page } from "@playwright/test";

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
import { enterLocations } from "./support/r06-locations";

const at = "2026-09-30T18:00:00.000Z";
const keyPath = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/physical-resources/key-slots`;
const lifecyclePath = (locationId: string) =>
  `/v1/staff/management/organizations/${ORG_A.organizationId}/locations/${locationId}/lifecycle`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function lifecycle(location: typeof LOCATION_A) {
  return {
    ...location,
    organizationId: ORG_A.organizationId,
    addressText: `${location.name} address`,
    status: "ACTIVE",
    acceptingIntake: true,
    updatedAt: at,
    readiness: {
      readyForActivation: true,
      checks: { currencySupported: true, timezoneValid: true },
    },
    drain: {
      blocked: false,
      activeShiftPresent: false,
      nonCompletedValetSessionPresent: false,
      nonTerminalTaskPresent: false,
    },
  };
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

async function choose(master: ReturnType<Page["getByTestId"]>, name: string) {
  await master.getByRole("button", { name: new RegExp(name) }).click();
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
      if (path === lifecyclePath(LOCATION_A.locationId))
        return { body: lifecycle(LOCATION_A) };
      if (path === lifecyclePath(LOCATION_B.locationId))
        return { body: lifecycle(LOCATION_B) };
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
  await enterLocations(page);
  const master = page.getByTestId("location-master");
  await choose(master, LOCATION_A.name);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Code").fill("A-CREATED");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await started.promise;

  await master
    .getByRole("button", { name: new RegExp(LOCATION_B.name) })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await choose(master, LOCATION_A.name);
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
      if (path === lifecyclePath(LOCATION_A.locationId))
        return { body: lifecycle(LOCATION_A) };
      if (path === lifecyclePath(LOCATION_B.locationId))
        return { body: lifecycle(LOCATION_B) };
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
  await enterLocations(page);
  const master = page.getByTestId("location-master");
  await choose(master, LOCATION_A.name);
  await page.getByRole("button", { name: "View label" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Physical resource label",
  });
  await expect(dialog.getByText("K-01", { exact: true })).toBeVisible();
  holdLabelRead = true;
  await dialog.getByRole("button", { name: "Download QR" }).click();
  await started.promise;

  await master
    .getByRole("button", { name: new RegExp(LOCATION_B.name) })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await choose(master, LOCATION_A.name);
  await expect(page.getByText("K-01", { exact: true })).toBeVisible();
  release.resolve();
  await page.waitForTimeout(200);

  expect(labelReads).toBeGreaterThanOrEqual(2);
  expect(downloaded).toBe(false);
  await expect(
    page.getByRole("dialog", { name: "Physical resource label" }),
  ).toHaveCount(0);
});
