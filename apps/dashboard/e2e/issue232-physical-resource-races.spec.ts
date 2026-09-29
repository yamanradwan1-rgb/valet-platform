import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { enterLocations } from "./support/r06-locations";

const at = "2026-09-29T03:00:00.000Z";
const keyPath = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/physical-resources/key-slots`;
const lifecyclePath = (locationId: string) =>
  `/v1/staff/management/organizations/${ORG_A.organizationId}/locations/${locationId}/lifecycle`;

function lifecycle(location: typeof LOCATION_A) {
  return {
    ...location,
    organizationId: ORG_A.organizationId,
    addressText: `${location.name} address`,
    status: "ACTIVE",
    acceptingIntake: true,
    updatedAt: at,
    readiness: { readyForActivation: true, checks: { currencySupported: true, timezoneValid: true } },
    drain: { blocked: false, activeShiftPresent: false, nonCompletedValetSessionPresent: false, nonTerminalTaskPresent: false },
  };
}

function key(code: string, id: string) {
  return { keySlotId: id, code, status: "ACTIVE", createdAt: at, updatedAt: at };
}

test("A to B to A fences stale physical-resource success", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, _request, api) => {
      if (path === lifecyclePath(LOCATION_A.locationId)) return { body: lifecycle(LOCATION_A) };
      if (path === lifecyclePath(LOCATION_B.locationId)) return { body: lifecycle(LOCATION_B) };
      if (path === keyPath(LOCATION_A.locationId)) {
        return api.count(path) === 1
          ? { delayMs: 900, body: { items: [key("STALE-A", "11111111-1111-4111-8111-111111111111")], nextCursor: null } }
          : { body: { items: [key("FRESH-A", "22222222-2222-4222-8222-222222222222")], nextCursor: null } };
      }
      if (path === keyPath(LOCATION_B.locationId)) return { body: { items: [key("B-01", "33333333-3333-4333-8333-333333333333")], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  const master = page.getByTestId("location-master");
  await master.getByRole("button", { name: new RegExp(LOCATION_A.name) }).click();
  await master.getByRole("button", { name: new RegExp(LOCATION_B.name) }).click();
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await master.getByRole("button", { name: new RegExp(LOCATION_A.name) }).click();
  await expect(page.getByText("FRESH-A", { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("STALE-A", { exact: true })).toHaveCount(0);
});

test("logout fences a delayed physical-resource response", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === lifecyclePath(LOCATION_A.locationId)) return { body: lifecycle(LOCATION_A) };
      if (path === keyPath(LOCATION_A.locationId)) return { delayMs: 900, body: { items: [key("LATE-A", "44444444-4444-4444-8444-444444444444")], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  await page.getByTestId("location-master").getByRole("button", { name: new RegExp(LOCATION_A.name) }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("LATE-A", { exact: true })).toHaveCount(0);
});
