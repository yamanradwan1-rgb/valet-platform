import { expect, test, type Locator } from "@playwright/test";
import { enterInspector, inspector, languages, setLocale, setTheme, themes } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";

// Computed sRGB contrast heuristic. A full WCAG 2.2 audit additionally needs
// axe/Lighthouse and real screen-reader review; no compliance claim is made.
async function contrastRatio(locator: Locator) {
  return locator.evaluate((node) => {
    const rgba = (value: string) => {
      const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/u);
      return match ? match.slice(1).map(Number) : null;
    };
    const luminance = (rgb: number[]) => rgb.map((channel) => {
      const n = channel / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
    const fg = rgba(getComputedStyle(node).color);
    let container: Element | null = node;
    let bg: number[] | null = null;
    while (container && !bg) {
      const style = getComputedStyle(container);
      const color = rgba(style.backgroundColor);
      if (color && !/rgba\([^)]*,\s*0\)/u.test(style.backgroundColor)) bg = color;
      container = container.parentElement;
    }
    if (!fg || !bg) return null;
    const [low, high] = [luminance(fg), luminance(bg)].sort((a, b) => a - b);
    return (high! + 0.05) / (low! + 0.05);
  });
}

for (const locale of languages) for (const theme of themes) {
  test(`Issue304 semantic keyboard and contrast ${locale}/${theme}`, async ({ page }) => {
    const fixture = issue304Fixture();
    await fixture.install(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await enterInspector(page);
    await setLocale(page, locale);
    await setTheme(page, theme);
    const root = inspector(page);
    await expect(root.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(root.getByRole("group", { name: /Resource family|نوع المورد/u })).toBeVisible();
    const family = root.locator('[data-c-family="spots"]');
    await family.focus();
    await page.keyboard.press("Enter");
    await expect(family).toHaveAttribute("aria-pressed", "true");
    for (const label of await root.locator('.c-kpi-label, [data-testid="issue304-kpi-label"]').all()) {
      const ratio = await contrastRatio(label);
      expect(ratio, "KPI label text contrast should be at least WCAG AA 4.5:1").not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(4.5);
    }
    await expect(root.getByRole("searchbox")).toHaveCount(0);
  });
}

test("Issue304 at actual Chromium page-scale 200% keeps actions reachable", async ({ page }) => {
  const fixture = issue304Fixture();
  await fixture.install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await enterInspector(page);
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await expect.poll(() => page.evaluate(() => visualViewport?.scale ?? 1)).toBe(2);
    const button = inspector(page).locator('[data-c-family="spots"]');
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const rect = await button.boundingBox();
    expect(rect?.width).toBeGreaterThanOrEqual(24);
    expect(rect?.height).toBeGreaterThanOrEqual(24);
  } finally {
    await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
    await client.detach();
  }
});
