import { expect, test, type Locator, type Page } from "@playwright/test";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import { md04FeatureAuthority } from "./support/md04-fixtures";
import { visitSearchPath, visitSearchReply } from "./support/md04-fixtures";
import { contextHelpRegistry } from "../src/features/help/context-help-registry";

async function rect(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  return result!;
}

function overlap(a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }) {
  const sharedWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const sharedHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return sharedWidth * sharedHeight;
}

async function assertNoOverlaps(page: Page, locale: "en" | "ar", width: number) {
  await page.setViewportSize({ width, height: 800 });
  const title = contextHelpRegistry["audit.table"][locale].title;
  const help = page.getByRole("button", { name: (locale === "en" ? "Help: " : "مساعدة: ") + title, exact: true });
  await expect(help).toBeVisible();
  const h = await rect(help);
  for (const action of [locale === "en" ? "Previous" : "السابق", locale === "en" ? "Next" : "التالي"]) {
    const control = page.getByRole("button", { name: action, exact: true });
    await expect(control).toBeVisible();
    expect(overlap(h, await rect(control)), `${locale} ${width}: table Help overlaps ${action}`).toBe(0);
  }
  const card = page.locator('[class*="audit-module"][class*="card"]').first();
  const bounds = await rect(card);
  expect(h.x).toBeGreaterThanOrEqual(bounds.x);
  expect(h.x + h.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  expect(h.y).toBeGreaterThanOrEqual(bounds.y);
  expect(h.y + h.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
  await help.click();
  await expect(page.getByRole("dialog", { name: title, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
}

test("Audit table Help avoids pagination hit targets at 320 and 390 in both languages", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A], companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === "/v1/staff/dashboard/feature-authority"
      ? md04FeatureAuthority(request, "CA") : md04AuditReply(path, request, "CA"),
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByText("Loaded 4 events", { exact: true })).toBeVisible();
  for (const width of [320, 390]) await assertNoOverlaps(page, "en", width);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  for (const width of [320, 390]) await assertNoOverlaps(page, "ar", width);
});

test("Contacts search Help does not cover Search or search fields at 320/390/768/1440 and RTL zoom", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => path === "/v1/staff/dashboard/feature-authority"
      ? md04FeatureAuthority(request, "CA")
      : path === visitSearchPath ? visitSearchReply(request, "CA") : undefined,
  });
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  const cases = [
    { width: 1440, locale: "en", zoom: false },
    { width: 320, locale: "en", zoom: false },
    { width: 390, locale: "ar", zoom: false },
    { width: 768, locale: "ar", zoom: false },
    { width: 768, locale: "ar", zoom: true },
  ] as const;
  for (const item of cases) {
    await page.setViewportSize({ width: item.width, height: 900 });
    const currentLocale = await page.locator("html").getAttribute("lang");
    if (currentLocale !== item.locale) {
      await page.getByRole("button", { name: currentLocale === "ar" ? "اللغة" : "Language" }).click();
    }
    await page.evaluate((zoom: boolean) => { document.documentElement.style.zoom = zoom ? "200%" : ""; }, item.zoom);
    const label = (item.locale === "ar" ? "مساعدة: " : "Help: ") +
      contextHelpRegistry["contacts.search"][item.locale].title;
    const help = page.getByRole("button", { name: label, exact: true });
    await expect(help).toBeVisible();
    const h = await rect(help);
    const search = page.getByRole("button", { name: item.locale === "ar" ? "بحث" : "Search", exact: true });
    expect(overlap(h, await rect(search)), `${item.width} ${item.locale} zoom=${item.zoom}: Search`).toBe(0);
    for (const field of await page.locator('form input, form select').all()) {
      expect(overlap(h, await rect(field)), `${item.width} ${item.locale}: field`).toBe(0);
    }
  }
});
