import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const output = join(tmpdir(), "vaylet-task02-postchange");
const locationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;

async function settle(page: Page) {
  await page.evaluate(async () => document.fonts.ready);
  await expect(page.locator(".shell")).toBeVisible();
  await page.locator(".shell").evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
}

async function enter(
  page: Page,
  fixture: DashboardApiFixture,
  scopeName: string,
) {
  await fixture.install(page);
  await page.goto("/help");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: scopeName }).click();
  await settle(page);
}

async function capture(page: Page, name: string) {
  mkdirSync(output, { recursive: true });
  await settle(page);
  await page.screenshot({
    path: join(output, `${name}-shell.png`),
    fullPage: true,
  });
  const trigger = page.locator(".location-context");
  await trigger.screenshot({ path: join(output, `${name}-trigger.png`) });
  const sidebar = page.locator(".sidebar");
  if (await sidebar.isVisible()) {
    await sidebar.screenshot({ path: join(output, `${name}-sidebar.png`) });
  }
}

async function expectDesktopShellGeometry(page: Page, triggerWidth: number) {
  const shell = await page.locator(".shell").boundingBox();
  const trigger = await page.locator(".location-context").boundingBox();
  const sidebar = await page.locator(".sidebar").boundingBox();
  const topbar = await page.locator(".topbar").boundingBox();
  const content = await page.locator(".content").boundingBox();
  expect(shell).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  expect(sidebar).toEqual({ x: 0, y: 0, width: 260, height: 900 });
  expect(topbar).toEqual({ x: 260, y: 0, width: 1180, height: 64 });
  expect(content).toEqual({ x: 260, y: 64, width: 1180, height: 836 });
  expect(trigger?.x).toBe(284);
  expect(trigger?.y).toBeCloseTo(11.5, 1);
  expect(trigger?.width).toBeCloseTo(triggerWidth, 1);
  expect(trigger?.height).toBe(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1440,
  );
}

test("closed shell geometry is unchanged and the new menu is the only added surface", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, fixture, LOCATION_A.name);
  await expectDesktopShellGeometry(page, 145.328125);
  await expect(page.locator(".location-context")).toHaveCSS(
    "border-radius",
    "8px",
  );
  await capture(page, "exact-en-light-desktop-closed");

  await page.locator(".shell").evaluate((element) => {
    element.setAttribute("data-task02-shell", "mounted");
  });
  const trigger = page.locator(".topbar").getByRole("button", {
    name: "Change scope",
    exact: true,
  });
  await trigger.focus();
  await trigger.press("ArrowDown");
  const menu = page.getByTestId("location-switch-menu");
  await expect(menu).toBeVisible();
  await expect(
    page.getByRole("option", { name: LOCATION_A.name }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator('.shell[data-task02-shell="mounted"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toHaveCount(0);
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1440);
  await page.screenshot({
    path: join(output, "exact-en-light-desktop-menu.png"),
    fullPage: true,
  });
  await page.getByRole("option", { name: LOCATION_A.name }).press("Escape");
  await expect(trigger).toBeFocused();
});

test("All Locations preserves the pre-change closed control and shell geometry", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, fixture, "All Locations");
  await expectDesktopShellGeometry(page, 144.96875);
  await capture(page, "all-en-light-desktop-closed");
});

test("RTL dark narrow placement stays on-screen with identical closed-control geometry", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, fixture, LOCATION_A.name);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.setViewportSize({ width: 480, height: 900 });
  await settle(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const trigger = await page.locator(".location-context").boundingBox();
  expect(trigger?.x).toBeCloseTo(318.671875, 1);
  expect(trigger?.y).toBeCloseTo(36.296875, 1);
  expect(trigger?.width).toBeCloseTo(145.328125, 1);
  expect(trigger?.height).toBe(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  await capture(page, "exact-ar-dark-narrow-closed");

  await page.getByRole("button", { name: "تغيير النطاق" }).click();
  const menu = page.getByTestId("location-switch-menu");
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(480);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  await page.screenshot({
    path: join(output, "exact-ar-dark-narrow-menu.png"),
    fullPage: true,
  });
});

test("menu loading and error states use the same anchored surface", async ({
  page,
}) => {
  let releaseLoading!: () => void;
  const loadingPending = new Promise<void>((resolve) => {
    releaseLoading = resolve;
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, fixture, LOCATION_A.name);
  await page.unroute("**/v1/staff/**");

  const locationPattern = `**${locationsPath}*`;
  const loadingRoute = async (route: import("@playwright/test").Route) => {
    await loadingPending;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [LOCATION_A, LOCATION_B],
        nextCursor: null,
      }),
    });
  };
  await page.route(locationPattern, loadingRoute);
  const trigger = page.locator(".topbar").getByRole("button", {
    name: "Change scope",
    exact: true,
  });
  await trigger.click();
  await expect(
    page
      .getByTestId("location-switch-menu")
      .getByText("Loading authorized scope…", { exact: true }),
  ).toBeVisible();
  mkdirSync(output, { recursive: true });
  await page.screenshot({
    path: join(output, "menu-loading.png"),
    fullPage: true,
  });
  releaseLoading();
  await expect(
    page.getByRole("listbox", { name: "Select location" }),
  ).toBeVisible();
  await trigger.click();
  await page.unroute(locationPattern, loadingRoute);

  const errorRoute = async (route: import("@playwright/test").Route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "UNAVAILABLE",
        message: "unavailable",
        requestId: "task02-menu-error",
      }),
    });
  };
  await page.route(locationPattern, errorRoute);
  await trigger.click();
  await expect(
    page.getByTestId("location-switch-menu").getByRole("alert"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.screenshot({
    path: join(output, "menu-error.png"),
    fullPage: true,
  });
  await page.unroute(locationPattern, errorRoute);
});

test("All Locations preserves RTL dark narrow geometry", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, fixture, "All Locations");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.setViewportSize({ width: 480, height: 900 });
  await settle(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  await capture(page, "all-ar-dark-narrow-closed");
});
