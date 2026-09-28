import { expect, test, type Request } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import {
  FULL_PHONE,
  customerHistoryPath,
  historyReply,
  md04FeatureAuthority,
  visitSearchPath,
  visitSearchReply,
} from "./support/md04-fixtures";
import {
  companyAnalytics,
  companyAnalyticsPath,
  PERIOD_A,
} from "./support/md05-intelligence-fixtures";

function cumulativeReply(path: string, request: Request) {
  if (path === "/v1/staff/dashboard/feature-authority") {
    return md04FeatureAuthority(request, "CA");
  }
  if (path === visitSearchPath) return visitSearchReply(request, "CA");
  if (path === customerHistoryPath) return historyReply(request, "CA");
  const audit = md04AuditReply(path, request, "CA");
  if (audit !== undefined) return audit;
  if (path === companyAnalyticsPath) return { body: companyAnalytics(request) };
  return undefined;
}

test("MD-06 cumulative EN/AR journey composes responsive keyboard-safe features", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: cumulativeReply,
  });
  await fixture.install(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/customers");
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page.getByLabel("Name").fill("Page");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Page One", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page Two", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();

  await page.getByLabel("Name").fill("Alex");
  await page.getByRole("button", { name: "Search" }).click();
  const details = page.getByRole("button", {
    name: "Details for result 1: Alex One",
  });
  await details.focus();
  await page.keyboard.press("Enter");
  const contactDrawer = page.getByRole("dialog", { name: "Alex One" });
  await expect(
    contactDrawer.getByRole("button", { name: "Close" }),
  ).toBeFocused();
  await expect(
    contactDrawer.getByText(FULL_PHONE, { exact: true }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();

  await page.setViewportSize({ width: 900, height: 900 });
  const auditLink = page.locator('a[href="/audit-log"]');
  await auditLink.focus();
  await page.keyboard.press("Enter");
  const inspect = page.getByRole("button", {
    name: "Inspect event 1: Company setting default changed",
  });
  await inspect.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Audit Event Details" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspect).toBeFocused();

  const language = page.getByRole("button", { name: "Language" });
  await language.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const arabicInspect = page.locator("tbody tr").first().getByRole("button");
  await arabicInspect.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("dialog")
      .locator('bdi[dir="ltr"]', {
        hasText: "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED",
      })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(arabicInspect).toBeFocused();

  await page.setViewportSize({ width: 480, height: 900 });
  const openNavigation = page.getByRole("button", { name: "فتح التنقل" });
  await openNavigation.focus();
  await page.keyboard.press("Enter");
  const mobileNavigation = page.getByRole("dialog", { name: "تنقل الإدارة" });
  const analyticsLink = mobileNavigation.locator('a[href="/analytics"]');
  await analyticsLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "التحليلات" })).toBeVisible();
  const period = page.getByRole("button", { name: "اختيار الفترة" }).first();
  await period.focus();
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog", { name: "اختيار فترة التحليلات" });
  await expect(dialog.getByLabel("من")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(period).toBeFocused();
  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog", { name: "اختيار فترة التحليلات" });
  await dialog.getByLabel("من").fill(PERIOD_A.from);
  await dialog.getByLabel("إلى").fill(PERIOD_A.to);
  await dialog.getByRole("button", { name: "تطبيق" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .locator("bdi[dir='ltr']", {
        hasText: `${PERIOD_A.from} – ${PERIOD_A.to}`,
      })
      .first(),
  ).toBeVisible();
  await expect(page.getByTestId("md05-analytics-page")).toBeVisible();
});
