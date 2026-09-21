import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const shiftsPath =
  `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview/active-shifts`;

function activeShifts() {
  return {
    items: [{
      shiftId: E2E_IDS.shift,
      membershipId: E2E_IDS.membership,
      startedAt: "2026-09-21T07:00:00.000Z",
    }],
    nextCursor: null,
  };
}

async function signInCompany(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
}

test("Company Admin active shifts require an exact active Location", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === shiftsPath ? { body: activeShifts() } : undefined,
  });
  await signInCompany(page, fixture);
  await page.getByRole("button", { name: "All Locations" }).click();

  await page.getByRole("button", { name: "Shifts" }).click();
  await expect(page.getByText("Select a Location to view this information.")).toBeVisible();
  expect(fixture.count(shiftsPath)).toBe(0);

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Shifts" }).click();

  await expect(page.getByText(E2E_IDS.shift, { exact: true })).toBeVisible();
  await expect(page.getByText(E2E_IDS.membership, { exact: true })).toBeVisible();
  expect(fixture.count(shiftsPath)).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("button", { name: /start shift|end shift|attendance|payroll/i })).toHaveCount(0);
});

test("Location Manager reads active shifts only for the granted Location", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === shiftsPath ? { body: activeShifts() } : undefined,
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  await expect(page.getByText(E2E_IDS.shift, { exact: true })).toBeVisible();
  expect(fixture.count(shiftsPath)).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Employees" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /start shift|end shift|attendance|payroll/i })).toHaveCount(0);
});
