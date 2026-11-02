import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { Issue408MfaFixture } from "./support/issue408-mfa-fixture";

for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"] as const)
    for (const width of [1440, 390]) {
      test(`Security freeze ${locale} ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(
          ({ locale, theme }) => {
            localStorage.setItem("vaylet_dashboard_locale", locale);
            localStorage.setItem("vaylet_dashboard_theme", theme);
          },
          { locale, theme },
        );
        const f = new Issue408MfaFixture();
        await f.install(page);
        await page.goto("/security");
        await page
          .getByLabel(locale === "en" ? "Email" : "البريد الإلكتروني")
          .fill("owner@example.com");
        await page
          .getByLabel(locale === "en" ? "Password" : "كلمة المرور")
          .fill("fixture-password");
        await page
          .getByRole("button", {
            name: locale === "en" ? "Sign in" : "تسجيل الدخول",
            exact: true,
          })
          .click();
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(
          page.getByRole("heading", {
            name: locale === "en" ? "Security" : "الأمان",
            exact: true,
          }),
        ).toBeVisible();
        if (process.env.ISSUE408_VISUAL_VARIANT !== "baseline") {
          await expect(
            page.getByRole("button", {
              name:
                locale === "en"
                  ? "Disable MFA"
                  : "إيقاف المصادقة متعددة العوامل",
              exact: true,
            }),
          ).toBeVisible();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.evaluate(() => document.fonts.ready);
        const output = process.env.ISSUE408_VISUAL_OUTPUT;
        if (output) {
          await mkdir(output, { recursive: true });
          const name = `${locale}-${theme}-${width}`;
          const cards = page.locator("main section");
          const boxes = await cards.evaluateAll((nodes) =>
            nodes.map((n) => {
              const r = n.getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            }),
          );
          await writeFile(
            `${output}/${name}.json`,
            JSON.stringify({ boxes, posts: f.posts.length }),
          );
          await page.addStyleTag({
            content: "nextjs-portal { display: none !important; }",
          });
          await page.mouse.move(0, 0);
          await page.screenshot({
            path: `${output}/${name}.png`,
            fullPage: true,
            animations: "disabled",
          });
        }
        if (process.env.ISSUE408_VISUAL_VARIANT !== "baseline") {
          const button = page.getByRole("button", {
            name:
              locale === "en" ? "Disable MFA" : "إيقاف المصادقة متعددة العوامل",
            exact: true,
          });
          await expect(button).toBeVisible();
          await button.focus();
          await page.keyboard.press("Enter");
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("textbox")).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(button).toBeFocused();
          await button.evaluate((e) => (e as HTMLElement).blur());
        }
        expect(f.posts).toHaveLength(0);
      });
    }
