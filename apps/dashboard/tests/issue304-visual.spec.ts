import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { enterInspector, inspector, languages, setLocale, setTheme, themes, widths } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";
import { approvedHtml, compareViewportPixels, configureApprovedHtml, visualLandmarks } from "./issue304-parity";

const evidence = join(process.cwd(), "../../docs/validation/issue304-w6/visual-final");

for (const width of widths) for (const locale of languages) for (const theme of themes) {
  test(`Issue304 approved exact HTML vs actual Dashboard ${width} ${locale}/${theme}`, async ({ browser, page }) => {
    const source = approvedHtml();
    const fixture = issue304Fixture();
    await fixture.install(page);
    await page.setViewportSize({ width, height: 900 });
    await enterInspector(page);
    await setLocale(page, locale);
    await setTheme(page, theme);

    const ref = await browser.newContext({ viewport: { width, height: 900 } });
    const refPage = await ref.newPage();
    try {
      await refPage.goto(source.uri, { waitUntil: "load" });
      await configureApprovedHtml(refPage, locale, theme);
      await page.evaluate(async () => document.fonts.ready);
      await refPage.evaluate(async () => document.fonts.ready);

      const root = inspector(page);
      const prototype = refPage.locator('[data-concept="c"]');
      await expect(root).toBeVisible();
      await expect(prototype).toBeVisible();
      const refLayout = await visualLandmarks(refPage, '[data-concept="c"]');
      const liveLayout = await visualLandmarks(page, '[data-issue304-inspector], [data-testid="issue304-inspector"]');
      expect(liveLayout.kpis.length, "The 6-card header is part of approved Option 3").toBe(6);
      expect(refLayout.kpis.length).toBe(6);
      expect(liveLayout.familySwitcher).not.toBeNull();
      expect(liveLayout.title).not.toBeNull();
      expect(liveLayout.documentWidth - liveLayout.viewportWidth).toBeLessThanOrEqual(2);

      const prefix = `option3-${width}-${locale}-${theme}`;
      mkdirSync(evidence, { recursive: true });
      const approvedPng = await refPage.screenshot({ path: join(evidence, `${prefix}-approved.png`), animations: "disabled" });
      const actualPng = await page.screenshot({ path: join(evidence, `${prefix}-integrated.png`), animations: "disabled" });
      const delta = await compareViewportPixels(page, approvedPng, actualPng);
      writeFileSync(join(evidence, `${prefix}-diff.json`), JSON.stringify({
        sourceHash: source.hash, size: width, locale, theme, delta,
        reference: refLayout, integrated: liveLayout,
        manualVisualApproval: "PENDING_REVIEW",
      }, null, 2));

      if (width <= 390) {
        const header = page.locator(".topbar");
        const signout = header.getByRole("button", { name: /Sign out|تسجيل الخروج/u });
        const [bar, control] = await Promise.all([header.boundingBox(), signout.boundingBox()]);
        expect(bar && control, "Header sign-out control visible").toBeTruthy();
        expect(control!.y + control!.height).toBeLessThanOrEqual(bar!.y + bar!.height + 2);
      }
    } finally { await ref.close(); }
  });
}
