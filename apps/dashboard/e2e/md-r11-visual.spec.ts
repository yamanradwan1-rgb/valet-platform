import { expect, test } from "@playwright/test";
import { setLocaleTheme } from "./support/md-r09-fixtures";
import { enterR11, r11Fixture } from "./support/md-r11-fixtures";
import { ORG_A } from "./support/dashboard-api-fixture";
import { administrationCopy } from "../src/features/administration/administration-copy";

// Measurements recorded from live 3011 before edits: H1 24/32, x292/y96;
// Policies/Roles table x293/y222/1114 wide, header44.5, Roles row65.
// Reference Arabic control is inert. Narrow overflow is an accessibility exception.
for (const width of [1440, 480]) {
  for (const locale of ["en", "ar"] as const) {
    for (const dark of [false, true]) {
      test(`R11 ${width} ${locale} ${dark ? "dark" : "light"}`, async ({
        page,
      }, info) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1440, height: 900 });
        const { fixture, state } = r11Fixture();
        await fixture.install(page);
        await enterR11(page);
        await setLocaleTheme(page, locale, dark);
        await page.setViewportSize({ width, height: 900 });
        const t = administrationCopy(locale);
        const surfaces = [
          "policies-company",
          "policies-location",
          "roles-permissions",
          "branding",
          "integrations",
          "billing-active",
          "help",
          "billing-null",
          "security",
        ];
        for (const surface of surfaces) {
          const route = surface.startsWith("policies")
            ? "policies"
            : surface.startsWith("billing")
              ? "billing-subscription"
              : surface;
          if (surface === "billing-null") state.nullSubscription = true;
          if (
            surface !== "policies-company" &&
            surface !== "policies-location"
          ) {
            await page.setViewportSize({ width: 1440, height: 900 });
            if (surface === "billing-null") {
              await page.goto("/billing-subscription");
              await page.getByRole("button", { name: ORG_A.name }).click();
            } else if (surface === "security") await page.goto("/security");
            else await page.locator(`nav a[href="/${route}"]`).click();
            await page.setViewportSize({ width, height: 900 });
          }
          if (surface === "policies-location")
            await page.getByRole("tab", { name: t.locationOverrides }).click();
          const title = page.locator("h1");
          await expect(title).toBeVisible();
          if (surface === "roles-permissions") {
            await expect(title).toHaveText(t.rolesTitle);
            await expect(page.locator("tbody tr")).toHaveCount(4);
          }
          if (surface.startsWith("policies"))
            await expect(
              page.locator('[data-setting="tipsEnabled"]'),
            ).toBeVisible();
          if (surface === "branding")
            await expect(page.getByLabel(t.displayName)).toHaveValue("VAYLET");
          if (surface === "integrations")
            await expect(
              page.getByText("PLATE_OCR", { exact: true }),
            ).toBeVisible();
          if (surface === "billing-active")
            await expect(
              page.getByText(t.planCode, { exact: true }),
            ).toBeVisible();
          if (surface === "billing-null")
            await expect(page.getByText(t.noSubscription)).toBeVisible();
          if (surface === "help")
            await expect(page.locator("details")).toHaveCount(4);
          if (surface === "security") {
            await expect(page.getByRole("status")).toContainText(
              locale === "en" ? "Verified" : "تم التحقق",
            );
            await expect(
              page
                .getByRole("alert")
                .filter({ hasText: /account security request|تعذر/ }),
            ).toHaveCount(0);
          }
          await expect(title).toHaveCSS("font-size", "24px");
          await expect(title).toHaveCSS("line-height", "32px");
          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            locale === "ar" ? "rtl" : "ltr",
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBe(width);
          if (
            width === 1440 &&
            locale === "en" &&
            (surface.startsWith("policies") || surface === "roles-permissions")
          ) {
            await expect
              .poll(async () => (await title.boundingBox())?.y)
              .toBe(96);
            expect((await title.boundingBox())!.x).toBe(292);
            const table = await page.locator("table").boundingBox();
            expect(table!.x).toBe(293);
            expect(table!.width).toBe(1114);
            await info.attach("geometry", {
              body: JSON.stringify(
                await page.locator('[data-testid="md02-page"]').evaluate((e) =>
                  [
                    ...e.querySelectorAll(
                      'h1,p,[role="tablist"],[role="tab"],table',
                    ),
                  ]
                    .slice(0, 8)
                    .map((n) => ({
                      text: n.textContent?.slice(0, 80),
                      box: n.getBoundingClientRect().toJSON(),
                      line: getComputedStyle(n).lineHeight,
                    })),
                ),
              ),
              contentType: "application/json",
            });
            expect(table!.y).toBe(222);
            expect((await page.locator("thead").boundingBox())!.height).toBe(
              44.5,
            );
            if (surface === "roles-permissions")
              expect(
                (await page.locator("tbody tr").first().boundingBox())!.height,
              ).toBe(65);
          }
          const region = page.locator('[role="region"][tabindex="0"]').first();
          if (await region.count()) {
            await region.focus();
            await expect(region).toBeFocused();
          }
          await title.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: info.outputPath(`${surface}.png`),
            fullPage: true,
          });
        }
      });
    }
  }
}
