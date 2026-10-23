import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;

import { PresenceFixture } from "../../../../apps/dashboard/e2e/support/presence-fixtures";
import { LOCATION_A, ORG_A } from "../../../../apps/dashboard/e2e/support/dashboard-api-fixture";

const evidence = fileURLToPath(new URL(".", import.meta.url));
const viewports = [1440, 768, 390, 320] as const;
const presentations = [
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
  { locale: "ar", theme: "light" },
  { locale: "ar", theme: "dark" },
] as const;

test("read-only production React shell geometry, pixel and zoom reference", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const fixture = new PresenceFixture("CA");
  await fixture.fixture.install(page);
  await page.goto("/policies");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 45_000 });
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const cases = [];
  mkdirSync(evidence, { recursive: true });
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    for (const { locale, theme } of presentations) {
      await page.evaluate(({ locale: nextLocale, theme: nextTheme }) => {
        localStorage.setItem("vaylet_dashboard_locale", nextLocale);
        localStorage.setItem("vaylet_dashboard_theme", nextTheme);
        window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
        window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
        document.documentElement.style.zoom = "1";
      }, { locale, theme });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const zooms = [1];
      if ((width === 1440 && locale === "en" && theme === "light") ||
          (width === 768 && locale === "ar" && theme === "dark") ||
          (width === 390 && locale === "en" && theme === "light") ||
          (width === 320 && locale === "ar" && theme === "dark")) {
        zooms.push(1.6, 2);
      }
      for (const zoom of zooms) {
        await page.evaluate((z) => {
          document.documentElement.style.zoom = String(z);
          document.querySelector(".content")?.scrollTo({ top: 0 });
        }, zoom);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        const metrics = await page.evaluate(() => {
          const selectors = [
            ".shell", ".sidebar", ".sidebar-brand", ".sidebar-scope",
            ".sidebar-navigation", ".sidebar-utilities", ".topbar",
            ".scope-line", ".topbar-actions", ".content", ".content-inner",
            "h1", '[role="tablist"]', '[role="tabpanel"]',
          ];
          const nodes = Object.fromEntries(selectors.map((selector) => {
            const el = document.querySelector<HTMLElement>(selector);
            if (!el) return [selector, null];
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return [selector, {
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              display: style.display, background: style.backgroundColor,
              borderColor: style.borderColor, color: style.color,
              fontFamily: style.fontFamily, fontSize: style.fontSize,
              padding: style.padding, gap: style.gap,
            }];
          }));
          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            document: { lang: document.documentElement.lang, dir: document.documentElement.dir,
              theme: document.documentElement.dataset.theme, scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth },
            sidebarCollapsed: document.querySelector(".shell")?.getAttribute("data-sidebar-collapsed"),
            activeNavigation: [...document.querySelectorAll<HTMLElement>('.nav-link[aria-current="page"]')]
              .map((node) => node.textContent?.trim()),
            nodes,
          };
        });
        const id = `${width}-${locale}-${theme}-zoom${Math.round(zoom * 100)}`;
        await page.screenshot({ path: join(evidence, `${id}.png`), animations: "disabled" });
        cases.push({ id, ...metrics });
      }
    }
  }
  writeFileSync(join(evidence, "geometry.json"), JSON.stringify({ source: "React DashboardShell at commit 20998a0; Playwright intercept fixtures only", cases }, null, 2));
  expect(fixture.writes).toEqual([]);
  expect(cases).toHaveLength(24);
});
