import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  activeShift,
  activeShiftsPath,
  STAFF_EMAIL,
  STAFF_EMAIL_2,
  STAFF_MEMBERSHIP_2,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";

async function enterCompany(page: Page, exactLocation = false) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: exactLocation ? LOCATION_A.name : "All Locations" }).click();
}

test("R05 Employees presents only truthful directory facts and loaded-page controls", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detail = `${directory}/${E2E_IDS.membership}`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === directory) return { body: { items: [
        staffItem(),
        staffItem({
          identity: { email: STAFF_EMAIL_2 },
          locationAccessCount: 1,
          membershipId: STAFF_MEMBERSHIP_2,
          role: "LOCATION_MANAGER",
          status: "INACTIVE",
          version: 4,
        }),
      ], nextCursor: null } };
      if (path === detail) return { body: staffDetail() };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterCompany(page);

  const table = page.getByRole("table");
  await expect(table.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await expect(table.getByText("Valet Employee", { exact: true })).toBeVisible();
  await expect(table.getByText("Location Manager", { exact: true })).toBeVisible();
  await expect(table.getByText("Active", { exact: true })).toBeVisible();
  await expect(table.getByText("Inactive", { exact: true })).toBeVisible();
  await expect(table.getByText(E2E_IDS.membership, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Search and filters apply to the loaded page only.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add Employee|Attendance/u })).toHaveCount(0);
  await expect(table.locator("img")).toHaveCount(0);

  const readsBefore = fixture.count(directory);
  await page.getByRole("searchbox").fill("manager.r05");
  await expect(table.getByText(STAFF_EMAIL_2, { exact: true })).toBeVisible();
  await expect(table.getByText(STAFF_EMAIL, { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Role" }).selectOption("LOCATION_MANAGER");
  await page.getByRole("combobox", { name: "Status" }).selectOption("INACTIVE");
  expect(fixture.count(directory)).toBe(readsBefore);

  await page.getByRole("searchbox").fill("");
  await page.getByRole("combobox", { name: "Role" }).selectOption("ALL");
  await page.getByRole("combobox", { name: "Status" }).selectOption("ALL");
  const opener = page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` });
  await opener.click();
  const drawer = page.getByRole("dialog", { name: "Details" });
  await expect(drawer.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await expect(drawer.getByText(E2E_IDS.membership, { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("R05 Shifts uses safe active-shift facts, Location timezone, and detail-only IDs", async ({ page }) => {
  const shiftsPath = activeShiftsPath(LOCATION_A.locationId);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === shiftsPath
      ? { body: { items: [activeShift()], nextCursor: null } }
      : undefined,
  });
  await fixture.install(page);
  await enterCompany(page, true);
  await page.getByRole("button", { name: "Shifts" }).click();

  const table = page.getByRole("table");
  await expect(table.getByText("Active shift", { exact: true })).toBeVisible();
  await expect(table.getByText(LOCATION_A.name, { exact: true })).toBeVisible();
  await expect(table.getByText(LOCATION_A.code, { exact: true })).toBeVisible();
  await expect(table.getByText("21 Sept 2026, 10:00", { exact: true })).toBeVisible();
  await expect(table.getByText(E2E_IDS.shift, { exact: true })).toHaveCount(0);
  await expect(table.getByText(E2E_IDS.membership, { exact: true })).toHaveCount(0);
  await expect(table.getByText("2026-09-21T07:00:00.000Z", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /start shift|end shift|attendance|payroll/i })).toHaveCount(0);

  const opener = table.getByRole("button", { name: "Details: Active shift" });
  await opener.click();
  const drawer = page.getByRole("dialog", { name: "Details" });
  await expect(drawer.getByText(E2E_IDS.shift, { exact: true })).toBeVisible();
  await expect(drawer.getByText(E2E_IDS.membership, { exact: true })).toBeVisible();
  await expect(drawer.getByText(LOCATION_A.name, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

test("R05 manager labels localize in Arabic with bidi-safe email, IDs, and time", async ({ page }) => {
  const directory = staffPath(ORG_A.organizationId);
  const detailPath = `${directory}/${E2E_IDS.membership}`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === directory) return { body: { items: [staffItem()], nextCursor: null } };
      if (path === detailPath) return { body: staffDetail() };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterCompany(page);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "الموظفون والورديات" })).toBeVisible();
  await expect(page.getByRole("table").locator('bdi[dir="ltr"]').filter({ hasText: STAFF_EMAIL })).toBeVisible();
  await expect(page.getByRole("table").getByText("موظف صف السيارات", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("نشط", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`التفاصيل: ${STAFF_EMAIL}`, "u") }).click();
  await expect(page.getByRole("dialog", { name: "التفاصيل" }).locator('bdi[dir="ltr"]').filter({ hasText: STAFF_EMAIL })).toBeVisible();
});
