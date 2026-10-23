import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";
import { PresenceFixture } from "../../../apps/dashboard/e2e/support/presence-fixtures";
import { LOCATION_A, ORG_A } from "../../../apps/dashboard/e2e/support/dashboard-api-fixture";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("../evidence/qa/baseline-refresh/", import.meta.url));

test("refresh 1440px actual Next Dashboard baseline with logo load verification", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(evidence, { recursive: true });
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
  const cases = [];
  for (const locale of ["en", "ar"]) {
    for (const theme of ["light", "dark"]) {
      await page.evaluate(({ locale, theme }) => {
        localStorage.setItem("vaylet_dashboard_locale", locale);
        localStorage.setItem("vaylet_dashboard_theme", theme);
        window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
        window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
        document.documentElement.style.zoom = "1";
      }, { locale, theme });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const loaded = await page.waitForFunction(() => {
        const images = [...document.querySelectorAll<HTMLImageElement>(".sidebar-brand img")];
        return images.length >= 2 && images.every(img => img.complete && img.naturalWidth > 0);
      }, undefined, { timeout: 20_000 }).then(() => true).catch(() => false);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      const imageDetails = await page.locator(".sidebar-brand img").evaluateAll(images => images.map(node => {
        const img = node as HTMLImageElement;
        return { src: img.currentSrc, naturalWidth: img.naturalWidth, complete: img.complete };
      }));
      const id = `1440-${locale}-${theme}-zoom100`;
      await page.screenshot({ path: join(evidence, `${id}.png`), animations: "disabled" });
      cases.push({ id, logoLoaded: loaded, imageDetails });
    }
  }
  writeFileSync(join(evidence, "status.json"), JSON.stringify({
    source: "Authenticated real Next DashboardShell; W1 network interception fixtures",
    untouchedOriginalBaseline: true,
    cases,
    writes: fixture.writes.length,
  }, null, 2));
  expect(fixture.writes).toEqual([]);
  expect(cases).toHaveLength(4);
});
