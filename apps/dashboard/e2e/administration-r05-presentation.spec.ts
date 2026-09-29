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
  SHIFT_ID_2,
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

  await expect(page.getByText("Manage staff authority and view active shifts.")).toBeVisible();
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

test("R05 Shifts uses safe row-specific actions, Location timezone, and detail-only IDs", async ({ page }) => {
  const shiftsPath = activeShiftsPath(LOCATION_A.locationId);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => path === shiftsPath
      ? { body: { items: [
        activeShift(),
        activeShift({
          membershipId: STAFF_MEMBERSHIP_2,
          shiftId: SHIFT_ID_2,
          startedAt: "2026-09-21T08:00:00.000Z",
        }),
      ], nextCursor: null } }
      : undefined,
  });
  await fixture.install(page);
  await enterCompany(page, true);
  await page.getByRole("button", { name: "Shifts" }).click();

  const table = page.getByRole("table");
  await expect(table.getByText("Active shift", { exact: true })).toHaveCount(2);
  await expect(table.getByText(LOCATION_A.name, { exact: true })).toHaveCount(2);
  await expect(table.getByText(LOCATION_A.code, { exact: true })).toHaveCount(2);
  await expect(table.getByText("21 Sept 2026, 10:00", { exact: true })).toBeVisible();
  await expect(table.getByText("21 Sept 2026, 11:00", { exact: true })).toBeVisible();
  await expect(table.getByText(E2E_IDS.shift, { exact: true })).toHaveCount(0);
  await expect(table.getByText(E2E_IDS.membership, { exact: true })).toHaveCount(0);
  await expect(table.getByText("2026-09-21T07:00:00.000Z", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /start shift|end shift|attendance|payroll/i })).toHaveCount(0);

  const firstOpener = table.getByRole("button", {
    name: `Details: ${LOCATION_A.name}, Started at 21 Sept 2026, 10:00`,
  });
  const secondOpener = table.getByRole("button", {
    name: `Details: ${LOCATION_A.name}, Started at 21 Sept 2026, 11:00`,
  });
  await expect(firstOpener).toHaveCount(1);
  await expect(secondOpener).toHaveCount(1);
  const labels = await table.locator("button[aria-label]").evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label") ?? ""));
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels.join(" ")).not.toContain(E2E_IDS.shift);
  expect(labels.join(" ")).not.toContain(E2E_IDS.membership);
  expect(labels.join(" ")).not.toContain(SHIFT_ID_2);
  expect(labels.join(" ")).not.toContain(STAFF_MEMBERSHIP_2);
  await secondOpener.click();
  const drawer = page.getByRole("dialog", { name: "Details" });
  await expect(drawer.getByText(SHIFT_ID_2, { exact: true })).toBeVisible();
  await expect(drawer.getByText(STAFF_MEMBERSHIP_2, { exact: true })).toBeVisible();
  await expect(drawer.getByText(LOCATION_A.name, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(secondOpener).toBeFocused();
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
      if (path === activeShiftsPath(LOCATION_A.locationId)) {
        return { body: { items: [activeShift()], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await enterCompany(page, true);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "الموظفون والورديات" })).toBeVisible();
  await expect(page.getByText("إدارة صلاحيات الموظفين وعرض الورديات النشطة.")).toBeVisible();
  await expect(page.getByRole("table").locator('bdi[dir="ltr"]').filter({ hasText: STAFF_EMAIL })).toBeVisible();
  await expect(page.getByRole("table").getByText("موظف صف السيارات", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("نشط", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`التفاصيل: ${STAFF_EMAIL}`, "u") }).click();
  await expect(page.getByRole("dialog", { name: "التفاصيل" }).locator('bdi[dir="ltr"]').filter({ hasText: STAFF_EMAIL })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "الورديات" }).click();
  const arabicTime = new Intl.DateTimeFormat("ar-JO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: LOCATION_A.timezone,
  }).format(new Date("2026-09-21T07:00:00.000Z"));
  const shiftAction = page.getByRole("table").locator("button[aria-label]");
  const shiftLabel = await shiftAction.getAttribute("aria-label");
  expect(shiftLabel).toContain("التفاصيل:");
  expect(shiftLabel).toContain(LOCATION_A.name);
  expect(shiftLabel).toContain("بدأت في");
  expect(shiftLabel).toContain(arabicTime);
  expect(shiftLabel).toContain("\u2068");
  expect(shiftLabel).toContain("\u2069");
  expect(shiftLabel).not.toContain(E2E_IDS.shift);
  expect(shiftLabel).not.toContain(E2E_IDS.membership);
});
