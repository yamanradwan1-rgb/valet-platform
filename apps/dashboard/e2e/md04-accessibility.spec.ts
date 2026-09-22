import { expect, test, type Page, type Request } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
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

function contactOverride(path: string, request: Request) {
  if (path === "/v1/staff/dashboard/feature-authority") {
    return md04FeatureAuthority(request, "CA");
  }
  if (path === visitSearchPath) return visitSearchReply(request, "CA");
  if (path === customerHistoryPath) return historyReply(request, "CA");
  return undefined;
}

async function enterContacts(page: Page) {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: contactOverride,
  });
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByLabel("Name").fill("Alex");
  await page.getByRole("button", { name: "Search" }).click();
}

test("Visit Contacts drawer and correction are keyboard-safe and restore focus", async ({ page }) => {
  await enterContacts(page);
  const row = page.locator("tbody tr").filter({ hasText: "Alex One" });
  const details = row.getByRole("button", { name: "Details" });
  await details.focus();
  await details.click();
  let drawer = page.getByRole("dialog", { name: "Alex One" });
  await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(details).toBeFocused();

  await details.click();
  drawer = page.getByRole("dialog", { name: "Alex One" });
  const correctName = drawer.getByRole("button", { name: "Correct name" });
  await correctName.click();
  const correction = page.getByRole("dialog", { name: "Correct Visit Contact" });
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  await expect(correction.getByRole("textbox", { name: "Display name", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  drawer = page.getByRole("dialog", { name: "Alex One" });
  await expect(drawer.getByRole("button", { name: "Correct name" })).toBeFocused();
});

test("Arabic MD-04 keeps mixed protected values safely LTR", async ({ page }) => {
  await enterContacts(page);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "جهات اتصال الزيارات", level: 1 })).toBeVisible();
  await expect(page.locator('bdi[dir="ltr"]', { hasText: FULL_PHONE }).first()).toBeVisible();
  await expect(page.locator('bdi[dir="ltr"]', { hasText: "2026-09-21T09:00:00.000Z" }).first()).toBeVisible();
});

test("Audit drawer restores focus and keeps canonical codes LTR in Arabic", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      return md04AuditReply(path, request, "CA");
    },
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  const firstInspect = page.getByRole("button", { name: "Inspect" }).first();
  await firstInspect.focus();
  await firstInspect.click();
  await page.keyboard.press("Escape");
  await expect(firstInspect).toBeFocused();
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "سجل التدقيق", level: 1 })).toBeVisible();
  await expect(page.locator('bdi[dir="ltr"]', {
    hasText: "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED",
  }).first()).toBeVisible();
});
