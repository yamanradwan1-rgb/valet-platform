import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  organizationEvents,
} from "./support/md04-audit-fixtures";
import {
  MD04_IDS,
  customer,
  historyReply,
  locationAuditPath,
  md04FeatureAuthority,
  orgAuditPath,
} from "./support/md04-fixtures";

const visitPathA =
  `/v1/staff/management/organizations/${ORG_A.organizationId}/visit-contacts`;
const visitPathB =
  `/v1/staff/management/organizations/${ORG_B.organizationId}/visit-contacts`;

function visitBody(label: string, nextCursor: string | null) {
  return {
    items: [customer(label, "CA")],
    matchState: "UNIQUE",
    mode: "NAME",
    nextCursor,
  };
}

async function chooseOrganization(page: Page, name: string) {
  await page.getByRole("button", { name }).click();
}

async function changeScope(page: Page) {
  const organizationSwitch = page.locator(".sidebar-scope");
  // External scope change can invalidate an open modal; dispatch the shell's
  // actual organization-switch action even when its backdrop blocks pointer input.
  if (await page.getByRole("dialog").count()) {
    await organizationSwitch.evaluate((button: HTMLButtonElement) => button.click());
  } else {
    await organizationSwitch.click();
  }
}

async function searchName(page: Page, name: string) {
  await page.getByLabel("Search mode").selectOption("NAME");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

test("Visit Contacts fences stale A cursor response across A to B to A scope lifecycles", async ({ page }) => {
  const requests: Array<{ org: "A" | "B"; cursor: string | null }> = [];
  let aFirstPages = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [],
      [ORG_B.organizationId]: [],
    },
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") {
        return md04FeatureAuthority(request, "CA");
      }
      if (path === `${visitPathA}/${MD04_IDS.customerA}/visits`) {
        return historyReply(request, "CA");
      }
      if (path !== visitPathA && path !== visitPathB) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      const org = path === visitPathA ? "A" : "B";
      requests.push({ org, cursor });
      if (path === visitPathB) {
        return { body: visitBody("B Current", null) };
      }
      if (cursor === "visit-a-cursor") {
        return {
          body: visitBody("Old A Page 2", null),
          delayMs: 800,
        };
      }
      aFirstPages += 1;
      if (aFirstPages === 1) {
        return { body: visitBody("A Initial", "visit-a-cursor") };
      }
      return aFirstPages === 2
        ? { body: visitBody("A Race Start", "visit-a-cursor") }
        : { body: visitBody("A Current Return", null) };
    },
  });
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, "admin@example.com");
  await chooseOrganization(page, ORG_A.name);
  await searchName(page, "ScopeRace");
  await expect(page.getByText("A Initial", { exact: true })).toBeVisible();
  await page.getByRole("button", {
    name: "Details for result 1: A Initial",
    exact: true,
  }).click();
  await expect(page.getByRole("dialog", { name: "A Initial" })).toBeVisible();
  await changeScope(page);
  await expect(page.getByRole("dialog", { name: "A Initial" })).toHaveCount(0);
  await chooseOrganization(page, ORG_B.name);
  await changeScope(page);
  await chooseOrganization(page, ORG_A.name);
  await searchName(page, "ScopeRace");
  await expect(page.getByText("A Race Start", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => requests.some((item) =>
    item.org === "A" && item.cursor === "visit-a-cursor",
  )).toBe(true);

  await changeScope(page);
  await chooseOrganization(page, ORG_B.name);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await searchName(page, "ScopeRace");
  await expect(page.getByText("B Current", { exact: true })).toBeVisible();
  expect(requests.filter((item) => item.org === "B").every((item) => item.cursor === null)).toBe(true);
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await expect(page.getByText("Old A Page 2", { exact: true })).toHaveCount(0);

  await changeScope(page);
  await chooseOrganization(page, ORG_A.name);
  await searchName(page, "ScopeRace");
  await expect(page.getByText("A Current Return", { exact: true })).toBeVisible();
  const currentA = requests.filter((item) => item.org === "A").at(-1);
  expect(currentA?.cursor).toBeNull();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await page.waitForTimeout(900);
  await expect(page.getByText("Old A Page 2", { exact: true })).toHaveCount(0);
  await expect(page.getByText("A Current Return", { exact: true })).toBeVisible();
});

test("late Visit Contact failure from A cannot damage current B scope", async ({ page }) => {
  const bUrls: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [],
      [ORG_B.organizationId]: [],
    },
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") {
        return md04FeatureAuthority(request, "CA");
      }
      if (path === visitPathA) {
        return {
          status: 503,
          body: { code: "UNAVAILABLE", message: "old A failure", requestId: "old-a" },
          delayMs: 450,
        };
      }
      if (path === visitPathB) {
        bUrls.push(request.url());
        return { body: visitBody("B Survives", null) };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, "admin@example.com");
  await chooseOrganization(page, ORG_A.name);
  await searchName(page, "FailScope");
  await expect.poll(() => fixture.count(visitPathA)).toBeGreaterThan(0);
  await changeScope(page);
  await chooseOrganization(page, ORG_B.name);
  await searchName(page, "ScopeRace");
  await expect(page.getByText("B Survives", { exact: true })).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.getByText(
    "The request could not be completed.",
    { exact: true },
  )).toHaveCount(0);
  await expect(page.getByText("B Survives", { exact: true })).toBeVisible();
  expect(bUrls.every((url) => !new URL(url).searchParams.has("cursor"))).toBe(true);
});

test("Audit fences delayed Organization cursor and resets filter across Location and Organization", async ({ page }) => {
  const requests: Array<{ path: string; cursor: string | null; eventType: string | null }> = [];
  let unfilteredOrganizationCalls = 0;
  const baseOrganization = organizationEvents()[0];
  const initialOrganization = {
    ...baseOrganization,
    eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6",
    occurredAt: "2026-09-22T06:00:00.000Z",
  };
  const oldOrganization = {
    ...baseOrganization,
    eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7",
    occurredAt: "2026-09-22T07:00:00.000Z",
  };
  const currentOrganization = {
    ...baseOrganization,
    eventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8",
    occurredAt: "2026-09-22T09:00:00.000Z",
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") {
        return md04FeatureAuthority(request, "CA");
      }
      if (path !== orgAuditPath && path !== locationAuditPath) return undefined;
      const url = new URL(request.url());
      const cursor = url.searchParams.get("cursor");
      const eventType = url.searchParams.get("eventType");
      requests.push({ path, cursor, eventType });
      if (path === locationAuditPath) {
        return { body: { items: [organizationEvents()[1]], nextCursor: null } };
      }
      if (cursor === "audit-scope-cursor") {
        return {
          body: { items: [oldOrganization], nextCursor: null },
          delayMs: 800,
        };
      }
      if (eventType === "LOCATION_CONFIGURATION_OVERRIDE_SET") {
        return {
          body: { items: [organizationEvents()[1]], nextCursor: "audit-scope-cursor" },
        };
      }
      unfilteredOrganizationCalls += 1;
      return {
        body: {
          items: [
            unfilteredOrganizationCalls === 1
              ? initialOrganization
              : currentOrganization,
          ],
          nextCursor: null,
        },
      };
    },
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page, "admin@example.com");
  await chooseOrganization(page, ORG_A.name);
  await page.getByRole("button", { name: "All Locations" }).click();
  await page.getByLabel("Event type").selectOption("LOCATION_CONFIGURATION_OVERRIDE_SET");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => requests.some((item) =>
    item.path === orgAuditPath &&
    item.cursor === "audit-scope-cursor" &&
    item.eventType === "LOCATION_CONFIGURATION_OVERRIDE_SET",
  )).toBe(true);

  await changeScope(page);
  await chooseOrganization(page, ORG_A.name);
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText("Location Audit", { exact: true })).toBeVisible();
  await expect(page.locator('time[datetime="2026-09-22T08:01:00.000Z"]')).toBeVisible();
  const locationRequest = requests.filter((item) => item.path === locationAuditPath).at(-1);
  expect(locationRequest).toMatchObject({ cursor: null, eventType: null });

  await changeScope(page);
  await chooseOrganization(page, ORG_A.name);
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.locator('time[datetime="2026-09-22T09:00:00.000Z"]')).toBeVisible();
  const currentOrganizationRequest = requests.filter((item) =>
    item.path === orgAuditPath && item.eventType === null,
  ).at(-1);
  expect(currentOrganizationRequest).toMatchObject({ cursor: null, eventType: null });
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await page.waitForTimeout(900);
  await expect(page.locator('time[datetime="2026-09-22T07:00:00.000Z"]')).toHaveCount(0);
  await expect(page.locator('time[datetime="2026-09-22T09:00:00.000Z"]')).toBeVisible();
});
