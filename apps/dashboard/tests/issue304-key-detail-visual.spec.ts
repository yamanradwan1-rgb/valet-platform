import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  enterInspector, inspector, languages, setLocale, setTheme, themes, widths,
} from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";
import {
  approvedHtml, compareViewportPixels, configureApprovedHtml,
} from "./issue304-parity";

const output = join(process.cwd(), "../../docs/validation/issue304-w6/key-detail-final");

for (const width of widths) for (const locale of languages) for (const theme of themes) {
  test(`Issue304 Key K-02 selected detail ${width} ${locale}/${theme}`, async ({ page, browser }) => {
    const approvedSource = approvedHtml();
    await issue304Fixture().install(page);
    await page.setViewportSize({ width, height: 900 });
    await enterInspector(page);
    await setLocale(page, locale);
    await setTheme(page, theme);
    const original = await browser.newContext({ viewport: { width, height: 900 } });
    const reference = await original.newPage();
    try {
      await reference.goto(approvedSource.uri);
      await configureApprovedHtml(reference, locale, theme);
      await inspector(page).locator('[data-resource-code="K-02"]').click();
      await reference.locator('[data-c-list] button').filter({ hasText: "K-02" }).first().click();
      const liveDetail = inspector(page).locator('[data-issue304-resource-detail]');
      const approvedDetail = reference.locator('[data-c-detail]');
      await expect(liveDetail).toBeVisible();
      await expect(approvedDetail).toBeVisible();
      await expect(liveDetail.locator('.c-vehicle')).toContainText("DEMO 4821");
      await expect(approvedDetail.locator('.c-vehicle')).toContainText("DEMO 4821");
      const bounds = async (detail: typeof liveDetail) => detail.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const vehicle = element.querySelector('.c-vehicle')?.getBoundingClientRect();
        return {
          detail: { x: box.x, y: box.y, width: box.width, height: box.height },
          vehicle: vehicle ? { x: vehicle.x, y: vehicle.y, width: vehicle.width, height: vehicle.height } : null,
          custodyText: element.querySelector('.c-timeline-section')?.textContent?.trim().slice(0, 250) ?? "",
        };
      });
      const name = `key-${width}-${locale}-${theme}`;
      mkdirSync(output, { recursive: true });
      const refPng = await reference.screenshot({ path: join(output, `${name}-approved.png`), animations: "disabled" });
      const livePng = await page.screenshot({ path: join(output, `${name}-integrated.png`), animations: "disabled" });
      const delta = await compareViewportPixels(page, refPng, livePng);
      writeFileSync(join(output, `${name}-comparison.json`), JSON.stringify({
        approvedHash: approvedSource.hash, width, locale, theme,
        approved: await bounds(approvedDetail), integrated: await bounds(liveDetail),
        diagnosticPixelDelta: delta, visualGate: "PENDING_INDEPENDENT_REVIEW",
        note: "Approved custody activity is demo-only; real Dashboard uses bounded API-backed events",
      }, null, 2));
    } finally { await original.close(); }
  });
}
