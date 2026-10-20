import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { LOCATION_A, LOCATION_B } from "../e2e/support/dashboard-api-fixture";
import { issue304Fixture } from "./issue304-fixture";
import {
  enterInspector, evidenceName, expectSixKpis, inspector,
  languages, selectFamily, selectLocation, setLocale, setTheme, themes, widths,
} from "./issue304-contract";

const evidence = join(process.cwd(), "../../docs/validation/issue304-w6/screenshots");

for (const width of widths) for (const locale of languages) for (const theme of themes) {
  test(`Issue304 KPIs A→B→A ${width}px ${locale} ${theme}`, async ({ page }) => {
    const fixture = issue304Fixture();
    await fixture.install(page);
    await page.setViewportSize({ width, height: 900 });
    await enterInspector(page);
    await setLocale(page, locale);
    await setTheme(page, theme);

    mkdirSync(evidence, { recursive: true });
    for (const location of ["A", "B", "A"] as const) {
      await selectLocation(page, location);
      await selectFamily(page, "keys");
      await expectSixKpis(page, location);
      await selectFamily(page, "spots");
      await expectSixKpis(page, location);
      await expect(inspector(page).getByRole("searchbox")).toHaveCount(0);
      const filename = evidenceName("option3-integrated", String(width), locale, theme, location);
      await inspector(page).screenshot({ path: join(evidence, `${filename}.png`), animations: "disabled" });
    }
    for (const location of [LOCATION_A, LOCATION_B]) {
      const base = `/v1/staff/dashboard/locations/${location.locationId}`;
      expect(fixture.count(`${base}/physical-resources/overview`)).toBeGreaterThan(0);
    }
  });
}
