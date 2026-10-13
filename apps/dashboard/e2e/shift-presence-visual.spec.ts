import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PresenceFixture } from "./support/presence-fixtures";

const output = join(tmpdir(), "vaylet-gps-d-visual");
const baseline = process.env.GPS_D_VISUAL_BASELINE === "true";
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"] as const)
    for (const width of [1440, 480]) {
      test(`Variant A ${locale}/${theme}/${width}: frozen regions, bounds and dialogs`, async ({
        page,
      }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewportSize({ width, height: 900 });
        const f = new PresenceFixture("CA");
        await f.open(page);
        const rows = page.locator("[data-setting]");
        await expect(rows.first()).toBeVisible();
        await page.evaluate(
          ({ locale, theme }) => {
            localStorage.setItem("vaylet_dashboard_locale", locale);
            localStorage.setItem("vaylet_dashboard_theme", theme);
            window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
            window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
          },
          { locale, theme },
        );
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        const frozen = await page.evaluate(() => {
          const selectors = [
            ".sidebar",
            ".topbar",
            "h1",
            '[role="tablist"]',
            "[data-setting]",
          ];
          return selectors.flatMap((selector) =>
            Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
              (node) => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return {
                  selector,
                  html: node.outerHTML,
                  geometry: [rect.x, rect.y, rect.width, rect.height],
                  style: [
                    style.fontFamily,
                    style.fontSize,
                    style.color,
                    style.backgroundColor,
                    style.padding,
                    style.borderRadius,
                    style.gap,
                  ],
                };
              },
            ),
          );
        });
        const name = `${locale}-${theme}-${width}`;
        mkdirSync(output, { recursive: true });
        if (baseline)
          writeFileSync(
            join(output, `${name}-baseline.json`),
            JSON.stringify(frozen),
          );
        else {
          const expected = JSON.parse(
            readFileSync(join(output, `${name}-baseline.json`), "utf8"),
          );
          // #278-D adds accessible, non-mutating Help triggers by design.
          // Normalize only their DOM subtree; retain the frozen geometry,
          // computed styles, original Save/Clear/input markup and every other
          // node, so actual presentation changes still fail this comparison.
          const ignoreAdditiveHelp = (html: string) =>
            html.replace(
              /<button\b(?=[^>]*\baria-label="(?:Help:|مساعدة:))[^>]*>[\s\S]*?<\/button>/gu,
              "",
            ).replace(
              /<span\b[^>]*\bdata-mobile-setting-help=""[^>]*><\/span>/gu,
              "",
            );
          const comparable = (items: typeof frozen, current: boolean) =>
            items.map((item) => ({
              ...item,
              // Owner accepted the existing 48px tab scrollport allocation
              // and 1px moved border for the separate Policies section Help.
              // Compare every other rect exactly against the pinned baseline.
              geometry: current && item.selector === '[role="tablist"]'
                ? [item.geometry[0]! - (locale === "ar" ? 48 : 0), item.geometry[1],
                    item.geometry[2]! + 48, item.geometry[3]! + 1]
                : item.geometry,
              html: ignoreAdditiveHelp(item.html.replace(
                /-module__[A-Za-z0-9_-]{6}__/g,
                "-module__SCOPE__",
              )),
            }));
          expect(comparable(frozen, true)).toEqual(comparable(expected, false));
          await expect(
            page.getByTestId("shift-presence").locator("[data-presence-field]"),
          ).toHaveCount(4);
          await page.getByTestId("shift-presence").scrollIntoViewIfNeeded();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: join(output, `${name}-section.png`),
            fullPage: true,
          });
          const add = page.getByRole("button", {
            name: locale === "ar" ? "إضافة منطقة" : "Add zone",
            exact: true,
          });
          await add.click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog.locator('[name="label"]')).toBeFocused();
          for (const field of ["code", "latitude", "longitude", "radiusMeters"])
            await expect(dialog.locator(`[name="${field}"]`)).toHaveAttribute(
              "dir",
              "ltr",
            );
          const box = await dialog.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          expect(box!.y + box!.height).toBeLessThanOrEqual(900);
          const footer = await dialog
            .getByRole("button", {
              name: locale === "ar" ? "حفظ" : "Save",
              exact: true,
            })
            .boundingBox();
          expect(footer!.y + footer!.height).toBeLessThanOrEqual(900);
          await page.screenshot({ path: join(output, `${name}-dialog.png`) });
          await page.keyboard.press("Shift+Tab");
          // The already-approved zone-form Help follows Save in tab order.
          // Reverse Tab from the first input must wrap to that final control.
          await expect(
            dialog.getByRole("button", {
              name: /^(Help:|مساعدة:)/u,
            }),
          ).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(add).toBeFocused();
        }
        await page.screenshot({
          path: join(
            output,
            `${name}-${baseline ? "baseline" : "candidate"}.png`,
          ),
        });
        expect(errors).toEqual([]);
      });
    }
