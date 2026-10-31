import { expect, test } from "@playwright/test";
import { openRouteTask } from "./support/issue343-route-fixture";

for (const width of [320, 390, 768, 1440]) {
  for (const locale of ["en", "ar"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`route viewer ${width}px ${locale} ${theme} keyboard and viewport`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(
          (value) => localStorage.setItem("vaylet_dashboard_theme", value),
          theme,
        );
        await openRouteTask(page);
        if (locale === "ar") {
          // Language is a pre-existing preference. Change it before opening the modal.
          await page.keyboard.press("Escape");
          await page
            .getByRole("button", { name: "Language", exact: true })
            .click();
          await page.locator("tbody button").first().click();
        }
        const viewName = locale === "ar" ? "عرض المسار" : "View Route";
        const closeName =
          locale === "ar" ? "إغلاق عارض المسار" : "Close route viewer";
        const sliderName =
          locale === "ar"
            ? "استعراض العيّنات المسجّلة"
            : "Inspect recorded samples";
        await page.getByRole("button", { name: viewName, exact: true }).click();
        const viewer = page.getByTestId("task-route-viewer");
        const slider = viewer.getByRole("slider", { name: sliderName });
        await expect(slider).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const close = viewer.getByRole("button", { name: closeName });
        await expect(close).toBeInViewport();
        const panel = viewer.getByRole("dialog");
        const box = await panel.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await slider.focus();
        await slider.press("End");
        await expect(slider).toHaveValue("1");
        await slider.press("Home");
        await expect(slider).toHaveValue("0");
        // Focus stays in the top dialog through forward and reverse tab traversal.
        await close.focus();
        await page.keyboard.press("Shift+Tab");
        expect(
          await panel.evaluate((node) => node.contains(document.activeElement)),
        ).toBe(true);
        for (let i = 0; i < 36; i++) {
          await page.keyboard.press("Tab");
          expect(
            await panel.evaluate((node) =>
              node.contains(document.activeElement),
            ),
          ).toBe(true);
        }
        await close.focus();
        await page.addStyleTag({
          content: "nextjs-portal { display:none !important; }",
        });
        await page.screenshot({
          path: testInfo.outputPath(`${width}-${locale}-${theme}-viewer.png`),
        });
        await page.keyboard.press("Escape");
        await expect(viewer).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: viewName, exact: true }),
        ).toBeFocused();
      });
    }
  }
}
