import { expect, test, type Page } from "@playwright/test";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { locationIntelligenceReply } from "./support/md05-intelligence-fixtures";
import { operationsReadReply } from "./support/operations-fixtures";
import { md04FeatureAuthority } from "./support/md04-fixtures";

const cases = [
  { path: "/analytics", width: 320, locale: "en", role: "LM" },
  { path: "/analytics", width: 390, locale: "ar", role: "LM" },
  { path: "/overview", width: 390, locale: "ar", role: "LM" },
  { path: "/payments", width: 390, locale: "ar", role: "LM" },
  { path: "/", width: 390, locale: "ar", role: "LM" },
  { path: "/live-operations", width: 320, locale: "en", role: "LM" },
  { path: "/live-operations", width: 390, locale: "ar", role: "LM" },
  { path: "/policies", width: 320, locale: "en", role: "CA" },
] as const;

async function enter(page: Page, item: typeof cases[number]) {
  const isCompany = item.role === "CA";
  const fixture = new DashboardApiFixture({
    companyOrganizations: isCompany ? [ORG_A] : [],
    companyLocations: isCompany ? { [ORG_A.organizationId]: [LOCATION_A] } : {},
    locationManagerOrganizations: isCompany ? [] : [ORG_A],
    locationManagerLocations: isCompany ? {} : { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === "/v1/staff/dashboard/feature-authority"
      ? md04FeatureAuthority(request, isCompany ? "CA" : "LM")
      : operationsReadReply(path) ?? locationIntelligenceReply(path, request),
  });
  await fixture.install(page);
  await page.goto(item.path);
  await signInOnCurrentPage(page, isCompany ? "admin@example.com" : "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: isCompany ? "All Locations" : LOCATION_A.name }).click();
  if (item.path === "/") await expect(page).toHaveURL(/\/overview$/u);
  if (item.locale === "ar") await page.getByRole("button", { name: "Language" }).click();
  await page.setViewportSize({ width: item.width, height: 820 });
  await expect(page.getByRole("button", { name: /^(Help:|مساعدة:)/u }).first()).toBeVisible();
}

for (const item of cases) {
  test(`${item.path} ${item.width} ${item.locale} Help does not obstruct visible controls`, async ({ page }) => {
    await enter(page, item);
    const result = await page.evaluate(() => {
      const bounds = (node: Element) => {
        const b = node.getBoundingClientRect();
        let x0 = Math.max(0, b.left); let y0 = Math.max(0, b.top);
        let x1 = Math.min(innerWidth, b.right); let y1 = Math.min(innerHeight, b.bottom);
        for (let a = node.parentElement; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (!/(auto|scroll|hidden|clip)/u.test(s.overflow + s.overflowX + s.overflowY)) continue;
          const rect = a.getBoundingClientRect();
          x0 = Math.max(x0, rect.left); y0 = Math.max(y0, rect.top);
          x1 = Math.min(x1, rect.right); y1 = Math.min(y1, rect.bottom);
        }
        return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
      };
      const intersection = (a: NonNullable<ReturnType<typeof bounds>>, b: NonNullable<ReturnType<typeof bounds>>) =>
        Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
        Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
      const help = Array.from(document.querySelectorAll<HTMLButtonElement>('main button[aria-label^="Help:"],main button[aria-label^="مساعدة:"]'));
      const actions = Array.from(document.querySelectorAll<HTMLButtonElement>('main button:not([aria-label^="Help:"]):not([aria-label^="مساعدة:"])'));
      const collisions: { help: string; control: string; area: number }[] = [];
      for (const h of help) {
        const hRect = bounds(h);
        if (!hRect) continue;
        for (const action of actions) {
          const aRect = bounds(action);
          if (!aRect) continue;
          const area = intersection(hRect, aRect);
          if (area > 0.5) collisions.push({ help: h.ariaLabel ?? "", control: action.innerText || action.ariaLabel || "", area: +area.toFixed(2) });
        }
      }
      return { collisions, helpCount: help.filter((h) => bounds(h) !== null).length };
    });
    expect(result.helpCount, `${item.path} ${item.width} ${item.locale}: visible Help`).toBeGreaterThan(0);
    expect(result.collisions, `${item.path} ${item.width} ${item.locale}: Help must not cover visible actions`).toEqual([]);
  });
}
