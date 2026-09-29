import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
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

test("A to B to A fences stale physical-resource failure", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, _request, api) => {
      if (path === lifecyclePath(LOCATION_A.locationId)) return { body: lifecycle(LOCATION_A) };
      if (path === lifecyclePath(LOCATION_B.locationId)) return { body: lifecycle(LOCATION_B) };
      if (path === keyPath(LOCATION_A.locationId)) {
        return api.count(path) === 1
          ? { delayMs: 900, status: 503, body: { code: "SERVICE_UNAVAILABLE", message: "stale failure", requestId: "stale-a" } }
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
  await expect(page.getByTestId("physical-resources-surface").getByRole("alert")).toHaveCount(0);
});

test("create in A cannot repaint B after the dispatched response arrives", async ({ page }) => {
  let createdA = false;
  let posts = 0;
  const created = key("A-CREATED", "55555555-5555-4555-8555-555555555555");
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path, request) => {
      if (path === lifecyclePath(LOCATION_A.locationId)) return { body: lifecycle(LOCATION_A) };
      if (path === lifecyclePath(LOCATION_B.locationId)) return { body: lifecycle(LOCATION_B) };
      if (path === keyPath(LOCATION_A.locationId) && request.method() === "POST") {
        posts += 1;
        createdA = true;
        return { delayMs: 900, status: 201, body: created };
      }
      if (path === keyPath(LOCATION_A.locationId)) return { body: { items: createdA ? [created] : [], nextCursor: null } };
      if (path === keyPath(LOCATION_B.locationId)) return { body: { items: [key("B-01", "33333333-3333-4333-8333-333333333333")], nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  const master = page.getByTestId("location-master");
  await master.getByRole("button", { name: new RegExp(LOCATION_A.name) }).click();
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Code").fill("A-CREATED");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect.poll(() => posts).toBe(1);
  await dialog.press("Escape");
  await master.getByRole("button", { name: new RegExp(LOCATION_B.name) }).click();
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("A-CREATED", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Physical resource label" })).toHaveCount(0);
  await master.getByRole("button", { name: new RegExp(LOCATION_A.name) }).click();
  await expect(page.getByText("A-CREATED", { exact: true })).toBeVisible();
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

test("identity replacement cannot repaint the new session from an old read", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, _request, api) => {
      if (path === lifecyclePath(LOCATION_A.locationId)) return { body: lifecycle(LOCATION_A) };
      if (path === keyPath(LOCATION_A.locationId)) {
        return api.count(path) === 1
          ? { delayMs: 900, body: { items: [key("OLD-IDENTITY", "66666666-6666-4666-8666-666666666666")], nextCursor: null } }
          : { body: { items: [key("NEW-IDENTITY", "77777777-7777-4777-8777-777777777777")], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  await page.getByTestId("location-master").getByRole("button", { name: new RegExp(LOCATION_A.name) }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "replacement@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await page.getByTestId("location-master").getByRole("button", { name: new RegExp(LOCATION_A.name) }).click();
  await expect(page.getByText("NEW-IDENTITY", { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("OLD-IDENTITY", { exact: true })).toHaveCount(0);
});
