import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { enterInspector, inspector, languages, setLocale, setTheme, themes, widths } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";
import { approvedHtml, compareViewportPixels, configureApprovedHtml } from "./issue304-parity";

const output = join(process.cwd(), "../../docs/validation/issue304-w6/spot-final");

async function boxes(page: Page, selector: string) {
  return page.locator(selector).evaluate((root) => {
    const origin = root.getBoundingClientRect();
    const rect = (query: string) => {
      const el = root.querySelector(query);
      if (!el) return null;
      const r = el.getBoundingClientRect(), css = getComputedStyle(el);
      return { x: Math.round(r.x - origin.x), y: Math.round(r.y - origin.y),
        width: Math.round(r.width), height: Math.round(r.height),
        font: css.fontFamily, size: css.fontSize, radius: css.borderRadius };
    };
    return {
      root: { x: Math.round(origin.x), y: Math.round(origin.y) },
      header: rect(".c-head"), kpis: rect(".c-kpis"), command: rect(".c-command-row"),
      master: rect(".c-master"), detail: rect(".c-detail"), vehicle: rect(".c-vehicle"),
      hero: rect(".c-resource-hero"), status: rect(".c-stat-pair"),
      lower: rect(".c-lower-grid"),
    };
  });
}

for (const width of widths) for (const locale of languages) for (const theme of themes) {
  test(`Issue304 Spot P-02 selected detail vs approved ${width} ${locale}/${theme}`, async ({ browser, page }) => {
    const source = approvedHtml();
    const fixture = issue304Fixture();
    await fixture.install(page);
    await page.setViewportSize({ width, height: 900 });
    await enterInspector(page);
    await setLocale(page, locale);
    await setTheme(page, theme);
    const reference = await browser.newContext({ viewport: { width, height: 900 } });
    const approved = await reference.newPage();
    try {
      await approved.goto(source.uri);
      await configureApprovedHtml(approved, locale, theme);
      await page.locator('[data-c-family="spots"]').click();
      await approved.locator('[data-c-family="spots"]').click();
      const liveRow = inspector(page).locator('[data-resource-code="P-02"]');
      const refRow = approved.locator('[data-c-list] button').filter({ hasText: "P-02" }).first();
      await expect(liveRow).toBeVisible();
      await expect(refRow).toBeVisible();
      await liveRow.click();
      await refRow.click();
      await expect(inspector(page).locator(".c-vehicle")).toContainText("DEMO 4821");
      await expect(approved.locator(".c-vehicle")).toContainText("DEMO 4821");
      const actualBoxes = await boxes(page, "[data-issue304-inspector]");
      const approvedBoxes = await boxes(approved, '[data-concept="c"]');
      const prefix = `spot-${width}-${locale}-${theme}`;
      mkdirSync(output, { recursive: true });
      const refImage = await approved.screenshot({ path: join(output, `${prefix}-approved.png`), animations: "disabled" });
      const liveImage = await page.screenshot({ path: join(output, `${prefix}-integrated.png`), animations: "disabled" });
      const delta = await compareViewportPixels(page, refImage, liveImage);
      const measured = { sourceHash: source.hash, variant: prefix,
        approved: approvedBoxes, integrated: actualBoxes,
        diagnosticPixelDifference: delta, visualGate: "PENDING_MANUAL_REVIEW" };
      writeFileSync(join(output, `${prefix}-comparison.json`), JSON.stringify(measured, null, 2));
      expect(actualBoxes.detail).not.toBeNull();
      expect(actualBoxes.vehicle).not.toBeNull();
      expect(actualBoxes.master).not.toBeNull();
    } finally { await reference.close(); }
  });
}
