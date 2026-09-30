import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const managementLocationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;

async function enterCompanyLocation(
  page: Page,
  fixture: DashboardApiFixture,
  path = "/help",
) {
  await fixture.install(page);
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.locator(".topbar").getByText(LOCATION_A.name),
  ).toBeVisible();
}

async function openMenu(page: Page) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await expect(
    page.getByRole("listbox", { name: "Select location" }),
  ).toBeVisible();
}

test("topbar open stays in shell and performs one bounded current-Organization discovery", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
  });
  await enterCompanyLocation(page, fixture);
  await page.locator(".shell").evaluate((element) => {
    element.setAttribute("data-task02-shell", "mounted");
  });
  fixture.counts.clear();

  await openMenu(page);
  await expect(
    page.getByRole("option", { name: LOCATION_B.name }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toHaveCount(0);
  await expect(
    page.locator('.shell[data-task02-shell="mounted"]'),
  ).toBeVisible();
  expect(fixture.count(managementLocationsPath)).toBe(1);
  expect(fixture.count("/v1/staff/management/organizations")).toBe(0);
  expect(fixture.count("/v1/staff/dashboard/organizations")).toBe(0);
  expect(fixture.count("/v1/staff/operational-context")).toBe(0);

  await page.getByRole("option", { name: LOCATION_B.name }).click();
  await expect(page).toHaveURL(/\/help$/u);
  await expect(
    page.locator(".topbar").getByText(LOCATION_B.name),
  ).toBeVisible();
  await expect(
    page.locator('.shell[data-task02-shell="mounted"]'),
  ).toBeVisible();
  expect(fixture.count(managementLocationsPath)).toBe(1);
});

test("All Locations is omitted on an exact-Location route", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
  });
  await enterCompanyLocation(page, fixture, "/live-operations");
  await openMenu(page);
  await expect(page.getByRole("option", { name: "All Locations" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("option", { name: LOCATION_B.name }),
  ).toBeVisible();
});

test("Location Manager sees granted Locations only and a revoked cached option cannot commit", async ({
  page,
}) => {
  const locationBSubscription = `/v1/staff/dashboard/locations/${LOCATION_B.locationId}/subscription`;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: {
      [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
    },
    override: (path) =>
      path === locationBSubscription
        ? {
            status: 404,
            body: {
              code: "AUTHORIZATION_DENIED",
              message: "revoked",
              requestId: "revoked",
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/help");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  await openMenu(page);
  await expect(page.getByRole("option", { name: "All Locations" })).toHaveCount(
    0,
  );
  const stale = page.getByRole("option", { name: LOCATION_B.name });
  await expect(stale).toBeVisible();
  await stale.click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_A.name,
  );
  await expect(page.getByRole("option", { name: LOCATION_B.name })).toHaveCount(
    0,
  );
  expect(fixture.count(locationBSubscription)).toBe(1);
});

test("pagination is explicit and never walks the cursor automatically", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path !== managementLocationsPath) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      return cursor === null
        ? { body: { items: [LOCATION_A], nextCursor: "cursorABCDEFG" } }
        : { body: { items: [LOCATION_B], nextCursor: null } };
    },
  });
  await enterCompanyLocation(page, fixture);
  fixture.counts.clear();
  await openMenu(page);
  await expect(
    page.getByRole("option", { name: LOCATION_A.name }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: LOCATION_B.name })).toHaveCount(
    0,
  );
  expect(fixture.count(managementLocationsPath)).toBe(1);
  await page.waitForTimeout(200);
  expect(fixture.count(managementLocationsPath)).toBe(1);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(
    page.getByRole("option", { name: LOCATION_B.name }),
  ).toBeVisible();
  expect(fixture.count(managementLocationsPath)).toBe(2);
});

test("keyboard navigation selects and dismisses with focus returned to the trigger", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
  });
  await enterCompanyLocation(page, fixture);
  const trigger = page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" });
  await trigger.focus();
  await trigger.press("ArrowDown");
  const selected = page.getByRole("option", { name: LOCATION_A.name });
  await expect(selected).toBeFocused();
  await selected.press("End");
  const last = page.getByRole("option", { name: LOCATION_B.name });
  await expect(last).toBeFocused();
  await last.press("Home");
  await expect(
    page.getByRole("option", { name: "All Locations" }),
  ).toBeFocused();
  await page.getByRole("option", { name: "All Locations" }).press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(selected).toBeFocused();
  await selected.press("End");
  await last.press("Enter");
  await expect(
    page.locator(".topbar").getByText(LOCATION_B.name),
  ).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("All Locations to exact Location to All Locations stays in-place with typed options", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await page.goto("/help");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await openMenu(page);
  await page.getByRole("option", { name: LOCATION_A.name }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    LOCATION_A.name,
  );
  await openMenu(page);
  await page.getByRole("option", { name: "All Locations" }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(
    "All Locations",
  );
  await expect(page).toHaveURL(/\/help$/u);
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toHaveCount(0);
});
