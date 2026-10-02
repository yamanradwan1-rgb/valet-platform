import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { staffItem, staffPath } from "./support/administration-r05-fixtures";
import {
  historyPath,
  historyRow as activeShift,
} from "./support/issue240e-history";

const out = join(tmpdir(), "vaylet-md-r05", "candidate");

async function waitForAdminLayout(page: import("@playwright/test").Page) {
  await page.getByTestId("md02-page").evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
}

function directoryRows() {
  const roles = [
    "ORG_ADMIN",
    "LOCATION_MANAGER",
    "VALET_SUPERVISOR",
    "VALET_EMPLOYEE",
    "VALET_EMPLOYEE",
  ] as const;
  return roles.map((role, index) =>
    staffItem({
      identity: { email: `r05.employee.${index + 1}@example.com` },
      locationAccessCount: index + 1,
      membershipId: `77777777-7777-4777-8777-7777777779${String(index).padStart(2, "0")}`,
      role,
      status: index === 3 ? "INACTIVE" : "ACTIVE",
    }),
  );
}

function shiftRows() {
  return [0, 1, 2, 3].map((index) =>
    activeShift({
      membershipId: `88888888-8888-4888-8888-8888888889${String(index).padStart(2, "0")}`,
      shiftId: `99999999-9999-4999-8999-9999999999${String(index).padStart(2, "0")}`,
      startedAt: `2026-09-21T${String(7 + index).padStart(2, "0")}:00:00.000Z`,
    }),
  );
}

test("R05 visual proof covers Employees and Shifts across theme, RTL, and narrow layout", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const directory = staffPath(ORG_A.organizationId);
  const shifts = historyPath();
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === directory)
        return { body: { items: directoryRows(), nextCursor: null } };
      if (path === shifts)
        return { body: { items: shiftRows(), nextCursor: null } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await waitForAdminLayout(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const heading = page.getByRole("heading", {
    name: "Employees & Shifts",
    level: 1,
  });
  await expect(heading).toHaveCSS("font-size", "24px");
  const headingBox = await heading.boundingBox();
  expect(headingBox?.x).toBe(292);
  expect(headingBox?.y).toBeCloseTo(96, 0);
  const searchBox = await page.getByRole("searchbox").boundingBox();
  expect(searchBox?.x).toBe(292);
  expect(searchBox?.y).toBeCloseTo(233, 0);
  expect(searchBox?.width).toBeCloseTo(288, 1);
  expect(searchBox?.height).toBeCloseTo(34, 1);
  const roleBox = await page
    .getByRole("combobox", { name: "Role" })
    .boundingBox();
  expect(roleBox?.x).toBe(592);
  expect(roleBox?.y).toBeCloseTo(231, 0);
  expect(roleBox?.width).toBe(185);
  expect(roleBox?.height).toBeCloseTo(38, 1);
  const employeeTable = page.getByRole("table");
  const employeeTableBox = await employeeTable.boundingBox();
  expect(employeeTableBox?.x).toBe(293);
  expect(employeeTableBox?.y).toBeCloseTo(294, 0);
  expect(employeeTableBox?.width).toBe(1114);
  const employeeHeader = await employeeTable
    .getByRole("row")
    .first()
    .boundingBox();
  const employeeRow = await employeeTable.getByRole("row").nth(1).boundingBox();
  expect(employeeHeader?.height).toBeCloseTo(44.5, 0);
  expect(employeeRow?.height).toBeCloseTo(69, 1);
  const employeeAction = await employeeTable
    .getByRole("button", { name: /Details/u })
    .first()
    .boundingBox();
  expect(employeeAction?.width).toBe(32);
  expect(employeeAction?.height).toBe(32);
  const employeeCard = employeeTable.locator("xpath=ancestor::div[2]");
  await expect(employeeCard).toHaveCSS("border-radius", "12px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1440,
  );
  await page.screenshot({
    path: join(out, "employees-en-light-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(employeeCard).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await expect(employeeCard).toHaveCSS("border-color", "rgb(23, 35, 70)");
  await page.screenshot({
    path: join(out, "employees-en-dark-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "الموظفون والورديات" }),
  ).toBeVisible();
  await page.screenshot({
    path: join(out, "employees-ar-dark-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "فاتح" }).click();
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(
    page.getByRole("heading", { name: "الموظفون والورديات" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  const employeeDetails = page
    .getByRole("table")
    .getByRole("button", { name: /التفاصيل/u })
    .first();
  await expect(employeeDetails).toBeVisible();
  await employeeDetails.scrollIntoViewIfNeeded();
  await expect(employeeDetails).toBeVisible();
  await page.screenshot({
    path: join(out, "employees-ar-light-narrow.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".sidebar-scope").click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "الورديات" }).click();
  await waitForAdminLayout(page);
  const shiftTable = page.getByRole("table");
  await expect(shiftTable).toBeVisible();
  const shiftHeader = await shiftTable.getByRole("row").first().boundingBox();
  const shiftRow = await shiftTable.getByRole("row").nth(1).boundingBox();
  expect(shiftHeader?.height).toBeCloseTo(44.5, 0);
  expect(shiftRow?.height).toBeCloseTo(69, 1);
  await page.screenshot({
    path: join(out, "shifts-ar-light-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "داكن" }).click();
  await page.screenshot({
    path: join(out, "shifts-ar-dark-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "اللغة" }).click();
  await expect(
    page.getByRole("heading", { name: "Employees & Shifts" }),
  ).toBeVisible();
  await page.screenshot({
    path: join(out, "shifts-en-dark-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Light" }).click();
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(
    page.getByRole("heading", { name: "Employees & Shifts" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  const shiftDetails = page
    .getByRole("table")
    .getByRole("button", { name: /Shift details/u })
    .first();
  await expect(shiftDetails).toBeVisible();
  await shiftDetails.scrollIntoViewIfNeeded();
  await expect(shiftDetails).toBeVisible();
  await page.screenshot({
    path: join(out, "shifts-en-light-narrow.png"),
    fullPage: true,
  });
});

test("R05 Location Manager Shifts keeps the same truthful reference family", async ({
  page,
}) => {
  mkdirSync(out, { recursive: true });
  const shifts = historyPath();
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === shifts
        ? { body: { items: shiftRows(), nextCursor: null } }
        : undefined,
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await waitForAdminLayout(page);
  await expect(page.getByRole("button", { name: "Employees" })).toBeVisible();
  const table = page.getByRole("table");
  await expect(
    table.getByText("Maya O’Connor", { exact: true }).first(),
  ).toBeVisible();
  const row = await table.getByRole("row").nth(1).boundingBox();
  expect(row?.height).toBeCloseTo(69, 1);
  await page.screenshot({
    path: join(out, "shifts-location-manager-en-light-desktop.png"),
    fullPage: true,
  });
});
