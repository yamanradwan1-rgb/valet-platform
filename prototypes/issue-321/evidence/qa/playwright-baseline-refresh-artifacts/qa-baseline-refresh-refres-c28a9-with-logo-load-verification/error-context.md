# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-baseline-refresh.spec.ts >> refresh 1440px actual Next Dashboard baseline with logo load verification
- Location: ..\..\prototypes\issue-321\tests\qa-baseline-refresh.spec.ts:11:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Sign in' })
Expected: visible
Timeout: 45000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 45000ms
  - waiting for getByRole('heading', { name: 'Sign in' })

```

```yaml
- alert
```

# Test source

```ts
  1  | import { mkdirSync, writeFileSync } from "node:fs";
  2  | import { join } from "node:path";
  3  | import { fileURLToPath } from "node:url";
  4  | import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";
  5  | import { PresenceFixture } from "../../../apps/dashboard/e2e/support/presence-fixtures";
  6  | import { LOCATION_A, ORG_A } from "../../../apps/dashboard/e2e/support/dashboard-api-fixture";
  7  |
  8  | const { expect, test } = playwrightTest;
  9  | const evidence = fileURLToPath(new URL("../evidence/qa/baseline-refresh/", import.meta.url));
  10 |
  11 | test("refresh 1440px actual Next Dashboard baseline with logo load verification", async ({ page }) => {
  12 |   test.setTimeout(180_000);
  13 |   mkdirSync(evidence, { recursive: true });
  14 |   await page.setViewportSize({ width: 1440, height: 900 });
  15 |   const fixture = new PresenceFixture("CA");
  16 |   await fixture.fixture.install(page);
  17 |   await page.goto("/policies");
> 18 |   await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 45_000 });
     |                                                                ^ Error: expect(locator).toBeVisible() failed
  19 |   await page.getByLabel("Email").fill("admin@example.com");
  20 |   await page.getByLabel("Password").fill("fixture-password");
  21 |   await page.getByRole("button", { name: "Sign in" }).click();
  22 |   await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  23 |   await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  24 |   await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  25 |   await expect(page.locator(".shell")).toBeVisible();
  26 |   const cases = [];
  27 |   for (const locale of ["en", "ar"]) {
  28 |     for (const theme of ["light", "dark"]) {
  29 |       await page.evaluate(({ locale, theme }) => {
  30 |         localStorage.setItem("vaylet_dashboard_locale", locale);
  31 |         localStorage.setItem("vaylet_dashboard_theme", theme);
  32 |         window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
  33 |         window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
  34 |         document.documentElement.style.zoom = "1";
  35 |       }, { locale, theme });
  36 |       await expect(page.locator("html")).toHaveAttribute("lang", locale);
  37 |       await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  38 |       const loaded = await page.waitForFunction(() => {
  39 |         const images = [...document.querySelectorAll<HTMLImageElement>(".sidebar-brand img")];
  40 |         return images.length >= 2 && images.every(img => img.complete && img.naturalWidth > 0);
  41 |       }, undefined, { timeout: 20_000 }).then(() => true).catch(() => false);
  42 |       await page.evaluate(async () => {
  43 |         await document.fonts.ready;
  44 |         await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  45 |       });
  46 |       const imageDetails = await page.locator(".sidebar-brand img").evaluateAll(images => images.map(node => {
  47 |         const img = node as HTMLImageElement;
  48 |         return { src: img.currentSrc, naturalWidth: img.naturalWidth, complete: img.complete };
  49 |       }));
  50 |       const id = `1440-${locale}-${theme}-zoom100`;
  51 |       await page.screenshot({ path: join(evidence, `${id}.png`), animations: "disabled" });
  52 |       cases.push({ id, logoLoaded: loaded, imageDetails });
  53 |     }
  54 |   }
  55 |   writeFileSync(join(evidence, "status.json"), JSON.stringify({
  56 |     source: "Authenticated real Next DashboardShell; W1 network interception fixtures",
  57 |     untouchedOriginalBaseline: true,
  58 |     cases,
  59 |     writes: fixture.writes.length,
  60 |   }, null, 2));
  61 |   expect(fixture.writes).toEqual([]);
  62 |   expect(cases).toHaveLength(4);
  63 | });
  64 |
```
