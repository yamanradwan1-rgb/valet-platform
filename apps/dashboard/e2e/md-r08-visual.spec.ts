import { expect, test } from "@playwright/test";
import { enterR08, r08Fixture } from "./support/r08-accountability";

for (const route of ["keys", "incidents", "audit-log"] as const) {
  for (const mode of ["light", "dark", "ar", "narrow"] as const) {
    test(`${route} ${mode} reference geometry`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await enterR08(page, `/${route}`, r08Fixture(), route === "audit-log");
      if (mode === "dark")
        await page.getByRole("button", { name: "Dark", exact: true }).click();
      if (mode === "ar")
        await page.getByRole("button", { name: "Language" }).click();
      if (mode === "narrow")
        await page.setViewportSize({ width: 480, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveCSS("font-size", "24px");
      await expect(h1).toHaveCSS("line-height", "32px");
      await expect(h1).toHaveCSS("font-weight", "700");
      const table = page.getByRole("table");
      const card = table.locator("..").locator("..");
      await expect(card).toHaveCSS("border-radius", "12px");
      if (mode === "light" && route !== "audit-log") {
        const box = await h1.boundingBox();
        expect(box?.x).toBeCloseTo(292, 0);
        expect(box?.y).toBeCloseTo(96, 0);
        const cardBox = await card.boundingBox();
        expect(cardBox?.y).toBeCloseTo(route === "keys" ? 238 : 232, 0);
        expect(cardBox?.width).toBeCloseTo(1110, 0);
        const row = await page.locator("tbody tr").first().boundingBox();
        expect(row?.height).toBeCloseTo(route === "keys" ? 65 : 53, 0);
      }
      if (mode === "dark")
        await expect(card).toHaveCSS("background-color", "rgb(13, 21, 47)");
      if (mode === "ar") {
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        await expect(table).toContainText(/[\u0600-\u06ff]/u);
      }
      if (mode === "narrow") {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(480);
        const region = page.getByRole("region", {
          name:
            route === "keys"
              ? "Keys"
              : route === "incidents"
                ? "Incidents"
                : "Audit Log",
        });
        await region.focus();
        await region.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        await expect(
          page.locator("tbody tr").first().getByRole("button"),
        ).toBeInViewport();
      }
      await page.screenshot({
        path: testInfo.outputPath(`${route}-${mode}.png`),
        fullPage: true,
      });
      await page.locator("tbody tr").first().getByRole("button").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const d = await dialog.boundingBox();
      expect(d!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      if (mode === "ar") expect(d!.x).toBeCloseTo(0, 0);
      await page.screenshot({
        path: testInfo.outputPath(`${route}-${mode}-drawer.png`),
        fullPage: true,
      });
    });
  }
}
