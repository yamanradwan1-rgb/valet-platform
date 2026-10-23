# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: capture.spec.ts >> read-only production React shell geometry, pixel and zoom reference
- Location: ..\..\tmp\issue-321-prototypes\prototypes\issue-321\evidence\baseline\capture.spec.ts:20:1

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3003/policies", waiting until "load"

```

# Test source

```ts
  1   | import { mkdirSync, writeFileSync } from "node:fs";
  2   | import { join } from "node:path";
  3   | import { fileURLToPath } from "node:url";
  4   | import playwrightTest from "../../../../apps/dashboard/node_modules/@playwright/test/index.js";
  5   |
  6   | const { expect, test } = playwrightTest;
  7   |
  8   | import { PresenceFixture } from "../../../../apps/dashboard/e2e/support/presence-fixtures";
  9   | import { LOCATION_A, ORG_A } from "../../../../apps/dashboard/e2e/support/dashboard-api-fixture";
  10  |
  11  | const evidence = fileURLToPath(new URL(".", import.meta.url));
  12  | const viewports = [1440, 768, 390, 320] as const;
  13  | const presentations = [
  14  |   { locale: "en", theme: "light" },
  15  |   { locale: "en", theme: "dark" },
  16  |   { locale: "ar", theme: "light" },
  17  |   { locale: "ar", theme: "dark" },
  18  | ] as const;
  19  |
  20  | test("read-only production React shell geometry, pixel and zoom reference", async ({ page }) => {
  21  |   await page.setViewportSize({ width: 1440, height: 900 });
  22  |   const fixture = new PresenceFixture("CA");
  23  |   await fixture.fixture.install(page);
> 24  |   await page.goto("/policies");
      |              ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  25  |   await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 45_000 });
  26  |   await page.getByLabel("Email").fill("admin@example.com");
  27  |   await page.getByLabel("Password").fill("fixture-password");
  28  |   await page.getByRole("button", { name: "Sign in" }).click();
  29  |   await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  30  |   await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  31  |   await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  32  |   await expect(page.locator(".shell")).toBeVisible();
  33  |   await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  34  |   await page.evaluate(async () => {
  35  |     await Promise.race([
  36  |       Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))),
  37  |       new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  38  |     ]);
  39  |   });
  40  |
  41  |   const cases = [];
  42  |   mkdirSync(evidence, { recursive: true });
  43  |   for (const width of viewports) {
  44  |     await page.setViewportSize({ width, height: 900 });
  45  |     for (const { locale, theme } of presentations) {
  46  |       await page.evaluate(({ locale: nextLocale, theme: nextTheme }) => {
  47  |         localStorage.setItem("vaylet_dashboard_locale", nextLocale);
  48  |         localStorage.setItem("vaylet_dashboard_theme", nextTheme);
  49  |         window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
  50  |         window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
  51  |         document.documentElement.style.zoom = "1";
  52  |       }, { locale, theme });
  53  |       await expect(page.locator("html")).toHaveAttribute("lang", locale);
  54  |       await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  55  |
  56  |       const zooms = [1];
  57  |       if ((width === 1440 && locale === "en" && theme === "light") ||
  58  |           (width === 768 && locale === "ar" && theme === "dark") ||
  59  |           (width === 390 && locale === "en" && theme === "light") ||
  60  |           (width === 320 && locale === "ar" && theme === "dark")) {
  61  |         zooms.push(1.6, 2);
  62  |       }
  63  |       for (const zoom of zooms) {
  64  |         await page.evaluate((z) => {
  65  |           document.documentElement.style.zoom = String(z);
  66  |           document.querySelector(".content")?.scrollTo({ top: 0 });
  67  |         }, zoom);
  68  |         await page.evaluate(async () => {
  69  |           await document.fonts.ready;
  70  |           await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  71  |         });
  72  |         const metrics = await page.evaluate(() => {
  73  |           const selectors = [
  74  |             ".shell", ".sidebar", ".sidebar-brand", ".sidebar-scope",
  75  |             ".sidebar-navigation", ".sidebar-utilities", ".topbar",
  76  |             ".scope-line", ".topbar-actions", ".content", ".content-inner",
  77  |             "h1", '[role="tablist"]', '[role="tabpanel"]',
  78  |           ];
  79  |           const nodes = Object.fromEntries(selectors.map((selector) => {
  80  |             const el = document.querySelector<HTMLElement>(selector);
  81  |             if (!el) return [selector, null];
  82  |             const rect = el.getBoundingClientRect();
  83  |             const style = getComputedStyle(el);
  84  |             return [selector, {
  85  |               rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  86  |               display: style.display, background: style.backgroundColor,
  87  |               borderColor: style.borderColor, color: style.color,
  88  |               fontFamily: style.fontFamily, fontSize: style.fontSize,
  89  |               padding: style.padding, gap: style.gap,
  90  |             }];
  91  |           }));
  92  |           return {
  93  |             viewport: { width: window.innerWidth, height: window.innerHeight },
  94  |             document: { lang: document.documentElement.lang, dir: document.documentElement.dir,
  95  |               theme: document.documentElement.dataset.theme, scrollWidth: document.documentElement.scrollWidth,
  96  |               clientWidth: document.documentElement.clientWidth },
  97  |             sidebarCollapsed: document.querySelector(".shell")?.getAttribute("data-sidebar-collapsed"),
  98  |             activeNavigation: [...document.querySelectorAll<HTMLElement>('.nav-link[aria-current="page"]')]
  99  |               .map((node) => node.textContent?.trim()),
  100 |             logoImages: [...document.querySelectorAll<HTMLImageElement>('.vaylet-logo img')]
  101 |               .map((img) => ({ complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })),
  102 |             nodes,
  103 |           };
  104 |         });
  105 |         const id = `${width}-${locale}-${theme}-zoom${Math.round(zoom * 100)}`;
  106 |         await page.screenshot({ path: join(evidence, `${id}.png`), animations: "disabled" });
  107 |         cases.push({ id, ...metrics });
  108 |       }
  109 |     }
  110 |   }
  111 |   writeFileSync(join(evidence, "geometry.json"), JSON.stringify({ source: "React DashboardShell at commit 20998a0; Playwright intercept fixtures only", cases }, null, 2));
  112 |   expect(fixture.writes).toEqual([]);
  113 |   expect(cases).toHaveLength(24);
  114 | });
  115 |
```
