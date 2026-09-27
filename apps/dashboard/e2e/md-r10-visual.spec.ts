import { expect, test } from "@playwright/test";
import {
  companyReportsFixture,
  enterCompanyReports,
} from "./support/md05-reports-e2e-helpers";
import { setLocaleTheme } from "./support/md-r09-fixtures";
import { enterR10Contacts } from "./support/md-r10-fixtures";
import { reportsCopy } from "../src/features/intelligence/reports-copy";
import { visitContactCopy } from "../src/features/visit-contacts/visit-contact-copy";

// Reference: live 3011, 100% zoom, 1440/480 x 900, light/dark.
// Reference Arabic toggle is inert; Arabic assertions verify production i18n.
for (const route of ["reports", "contacts"] as const) {
  for (const width of [1440, 480]) {
    for (const locale of ["en", "ar"] as const) {
      for (const dark of [false, true]) {
        test(`${route} ${width} ${locale} ${dark ? "dark" : "light"}`, async ({
          page,
        }, info) => {
          await page.setViewportSize({ width: 1440, height: 900 });
          if (route === "reports") {
            await companyReportsFixture().install(page);
            await enterCompanyReports(page);
          } else await enterR10Contacts(page);
          await setLocaleTheme(page, locale, dark);
          await page.setViewportSize({ width, height: 900 });
          await expect(page.locator("h1")).toHaveCSS("font-size", "24px");
          await expect(page.locator("h1")).toHaveCSS("line-height", "32px");
          if (route === "contacts") {
            await expect(page.locator("th").first()).toHaveCSS(
              "text-align",
              "start",
            );
            await expect(page.locator("th").last()).toHaveCSS(
              "text-align",
              "end",
            );
          }
          if (width === 1440 && locale === "en") {
            const title = await page.locator("h1").boundingBox();
            expect(title!.x).toBe(292);
            expect(title!.y).toBe(96);
            const table = await page.locator("table").boundingBox();
            expect(table!.x).toBe(293);
            expect(table!.width).toBe(1114);
            expect((await page.locator("thead").boundingBox())!.height).toBe(
              44.5,
            );
            if (route === "reports") expect(table!.y).toBe(224);
            else
              await expect(page.getByLabel("Name", { exact: true })).toHaveCSS(
                "height",
                "38px",
              );
          }
          await expect(page.locator("tbody tr")).toHaveCount(
            route === "reports" ? 3 : 2,
          );
          const scroller = page
            .locator('[role="region"][tabindex="0"]')
            .first();
          await scroller.focus();
          await expect(scroller).toBeFocused();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBe(width);
          await page.screenshot({
            path: info.outputPath("page.png"),
            fullPage: true,
          });
          if (route === "reports") {
            const t = reportsCopy(locale);
            await page
              .getByRole("button", { name: t.previewDaily, exact: true })
              .click();
            const dialog = page.getByRole("dialog");
            await dialog
              .getByLabel(t.selectorDate, { exact: true })
              .fill("2026-09-21");
            await dialog.getByRole("button", { name: t.loadPreview }).click();
            await expect(
              page.getByTestId("report-preview-content"),
            ).toBeVisible();
            await expect(
              dialog
                .locator("dt")
                .filter({ hasText: "checkInTime.averageSeconds" }),
            ).toContainText(
              locale === "en" ? "Average duration" : "متوسط المدة",
            );
            await expect(
              dialog.getByRole("button", { name: "CSV", exact: false }),
            ).toBeInViewport();
            const body = dialog.locator('[class*="dialogBody"]');
            expect(
              await body.evaluate((node) => node.scrollHeight),
            ).toBeGreaterThan(await body.evaluate((node) => node.clientHeight));
          } else {
            const t = visitContactCopy(locale);
            await page
              .getByRole("button", {
                name: new RegExp(`${t.detailsForResult} 1:`),
              })
              .click();
            const dialog = page.getByRole("dialog");
            await expect(
              dialog.getByText("COMPLETED", { exact: true }),
            ).toBeVisible();
            await expect(dialog.locator("time").first()).toContainText("UTC");
            const box = await dialog.boundingBox();
            expect(box!.width).toBe(448);
            expect(box!.height).toBe(900);
            expect(box!.x).toBe(locale === "ar" ? 0 : width - 448);
            const facts = await dialog
              .locator('[class*="factGrid"]')
              .boundingBox();
            expect(facts!.x).toBeGreaterThanOrEqual(box!.x + 24);
            expect(facts!.x + facts!.width).toBeLessThanOrEqual(
              box!.x + box!.width - 24,
            );
          }
          const dialog = page.getByRole("dialog");
          const box = await dialog.boundingBox();
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.y + box!.height).toBeLessThanOrEqual(900);
          await info.attach("overlay-geometry", {
            body: JSON.stringify(box),
            contentType: "application/json",
          });
          await page.screenshot({ path: info.outputPath("overlay.png") });
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
        });
      }
    }
  }
}
