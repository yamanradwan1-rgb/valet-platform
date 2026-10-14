import { expect, test, type Locator } from "@playwright/test";
import { contextHelpRegistry } from "../src/features/help/context-help-registry";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import { md04FeatureAuthority } from "./support/md04-fixtures";

const cases = [
  { width: 1440, locale: "en", theme: "Light", zoom: false },
  { width: 1440, locale: "ar", theme: "Dark", zoom: false },
  { width: 768, locale: "en", theme: "Dark", zoom: false },
  { width: 768, locale: "ar", theme: "Light", zoom: false },
  { width: 390, locale: "en", theme: "Light", zoom: false },
  { width: 390, locale: "ar", theme: "Dark", zoom: false },
  { width: 320, locale: "en", theme: "Dark", zoom: false },
  { width: 320, locale: "ar", theme: "Light", zoom: false },
  { width: 768, locale: "ar", theme: "Dark", zoom: true },
] as const;

async function bounds(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}
function overlap(a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

for (const { path, key } of [
  { path: "/audit-log", key: "audit.page" },
  { path: "/customers", key: "contacts.page" },
] as const) {
  test(`${path} page Help preserves scope badge and text geometry across EN/AR, responsive and zoom`, async ({ page }) => {
    const writes: string[] = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A], companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (api, request) => {
        if (request.method() !== "GET" && !api.startsWith("/v1/staff/auth/")) writes.push(api);
        return api === "/v1/staff/dashboard/feature-authority" ? md04FeatureAuthority(request, "CA") :
          md04AuditReply(api, request, "CA");
      },
    });
    await fixture.install(page);
    await page.goto(path);
    await signInOnCurrentPage(page, "admin@example.com");
    await page.getByRole("button", { name: ORG_A.name }).click();
    if (path === "/audit-log") await page.getByRole("button", { name: "All Locations" }).click();
    await expect(page.locator('main [class*="scopeBadge"]')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    for (const spec of [...cases, { width: 768, locale: "en", theme: "Light", zoom: "native" },
      { width: 768, locale: "ar", theme: "Dark", zoom: "native" }] as const) {
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
      await page.setViewportSize({ width: spec.width, height: 900 });
      await page.evaluate(() => { document.documentElement.style.zoom = ""; });
      const current = await page.locator("html").getAttribute("lang");
      if (current !== spec.locale) await page.getByRole("button", { name: current === "ar" ? "اللغة" : "Language" }).click();
      const themeButtons = page.getByRole("group", { name: spec.locale === "ar" ? "المظهر" : "Theme" });
      await themeButtons.locator("button").nth(spec.theme === "Light" ? 0 : 1).click();
      if (spec.zoom === true) await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
      if (spec.zoom === "native") await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
      const title = contextHelpRegistry[key][spec.locale].title;
      const help = page.getByRole("button", { name: `${spec.locale === "ar" ? "مساعدة: " : "Help: "}${title}`, exact: true });
      const scopeBadge = page.locator('main [class*="scopeBadge"]').first();
      const heading = page.getByRole("heading", { level: 1 });
      const subtitle = page.locator('main [class*="header"] [class*="subtitle"]').first();
      await expect(help).toBeVisible();
      await expect(scopeBadge).toBeVisible();
      const h = await bounds(help);
      const label = `${key} ${spec.width} ${spec.locale} ${spec.theme} zoom=${spec.zoom}`;
      for (const [name, element] of [["badge", scopeBadge], ["title", heading], ["subtitle", subtitle]] as const) {
        expect(overlap(h, await bounds(element)), `${label}: Help overlaps ${name}`).toBe(0);
      }
      const hit = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return Boolean(el?.closest('button[aria-label^="Help:"],button[aria-label^="مساعدة:"]'));
      }, { x: h.x + h.width / 2, y: h.y + h.height / 2 });
      expect(hit, `${label}: Help center receives pointer`).toBe(true);
      expect(h.x, label).toBeGreaterThanOrEqual(0);
      expect(h.x + h.width, label).toBeLessThanOrEqual(spec.width + 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      // Existing 768px CSS-zoom baseline expands document.scrollWidth by 768px;
      // compare against that verified behavior, not against native page-scale zoom.
      const baselineOverflow = spec.zoom === true ? 768 : 0;
      expect(overflow, `${label}: baseline-equivalent horizontal overflow`).toBeLessThanOrEqual(baselineOverflow + 1);
      await help.focus();
      await expect(help).toBeFocused();
      // Chrome CDP page-scale emulation changes physical pointer coordinates;
      // use keyboard activation for its real scale mode, while other cases
      // exercise true pointer clicks and center hit testing.
      if (spec.zoom === "native") await help.press("Enter");
      else await help.click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toContainText(contextHelpRegistry[key][spec.locale].body);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(help).toBeFocused();
    }
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    expect(writes).toEqual([]);
    await expect(page).toHaveURL(path);
  });
}
