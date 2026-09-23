import { expect, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import {
  companyAnalytics,
  companyAnalyticsPath,
  PERIOD_A,
} from "./md05-intelligence-fixtures";

async function gridColumns(locator: ReturnType<Page["locator"]>) {
  return locator.evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(" ").length
  );
}

export async function expectOverviewReferenceGeometry(
  page: Page,
  metricColumns: number,
  lowerColumns: number,
) {
  const title = page.locator('[data-testid="md05-overview-page"] h1');
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("font-weight", "700");
  const cards = page.locator('[data-testid="md05-overview-page"] [class*="metricCard"]');
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toHaveCSS("padding", "20px");
  await expect(cards.first()).toHaveCSS("border-radius", "12px");
  const icon = cards.first().locator('[class*="metricIcon"]').first();
  await expect(icon).toHaveCSS("width", "44px");
  await expect(icon).toHaveCSS("height", "44px");
  await expect.poll(async () =>
    gridColumns(page.locator('[data-testid="md05-overview-page"] [class*="metricGrid"]')),
  ).toBe(metricColumns);
  await expect.poll(async () =>
    gridColumns(page.locator('[data-testid="md05-overview-page"] [class*="lowerGrid"]')),
  ).toBe(lowerColumns);
  const activity = page.getByRole("heading", { name: /Vehicle Activity|نشاط المركبات/u }).locator("..").locator("..");
  await expect(activity).toHaveCSS("padding", "20px");
  await expect(activity).toHaveCSS("border-radius", "12px");
  await expect(activity.getByRole("img")).toHaveCSS("height", "260px");
}

export async function expectPaymentsReferenceGeometry(
  page: Page,
  columns: number,
) {
  const title = page.locator('[data-testid="md05-payments-page"] h1');
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("font-weight", "700");
  const cards = page.locator('[data-testid="md05-payments-page"] [class*="summaryCard"]');
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toHaveCSS("padding", "20px");
  await expect(cards.first()).toHaveCSS("border-radius", "12px");
  const icon = cards.first().locator('[class*="summaryIcon"]').first();
  await expect(icon).toHaveCSS("width", "40px");
  await expect(icon).toHaveCSS("height", "40px");
  await expect(icon).toHaveCSS("border-radius", "12px");
  await expect.poll(async () =>
    gridColumns(page.locator('[data-testid="md05-payments-page"] [class*="summaryGrid"]')),
  ).toBe(columns);
  const panel = page.getByRole("heading", { name: /Financial Breakdown|التفصيل المالي/u }).locator("..").locator("..");
  await expect(panel).toHaveCSS("border-radius", "12px");
  const header = panel.getByRole("columnheader").first();
  await expect(header).toHaveCSS("padding-left", "20px");
  await expect(header).toHaveCSS("padding-top", "12px");
}

async function enterCompany(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

async function selectPeriod(page: Page) {
  await page
    .locator('[data-testid^="md05-"][data-testid$="-page"] button[aria-haspopup="dialog"]')
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill(PERIOD_A.from);
  await dialog.getByLabel("To").fill(PERIOD_A.to);
  await dialog.getByRole("button", { name: "Apply" }).click();
}

function visualFixture() {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) =>
      path === companyAnalyticsPath
        ? { body: companyAnalytics(request) }
        : undefined,
  });
}

export async function proveOverviewReferenceGeometry(page: Page) {
  const fixture = visualFixture();
  await fixture.install(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterCompany(page, "/overview");
  await selectPeriod(page);
  await expectOverviewReferenceGeometry(page, 4, 2);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectOverviewReferenceGeometry(page, 4, 2);
  await page.setViewportSize({ width: 480, height: 900 });
  await expectOverviewReferenceGeometry(page, 1, 1);
  await page.getByRole("button", { name: "اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expectOverviewReferenceGeometry(page, 1, 1);
}

export async function provePaymentsReferenceGeometry(page: Page) {
  const fixture = visualFixture();
  await fixture.install(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterCompany(page, "/payments");
  await selectPeriod(page);
  await expectPaymentsReferenceGeometry(page, 4);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectPaymentsReferenceGeometry(page, 4);
  await page.setViewportSize({ width: 480, height: 900 });
  await expectPaymentsReferenceGeometry(page, 1);
  await page.getByRole("button", { name: "اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expectPaymentsReferenceGeometry(page, 1);
}
