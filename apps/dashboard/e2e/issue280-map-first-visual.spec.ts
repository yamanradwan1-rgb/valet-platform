import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PresenceFixture } from "./support/presence-fixtures";
import { mockPresenceMap } from "./support/presence-map-mock";

const evidence = resolve(__dirname, "../../../tmp/issue-280-w7-qa");
const widths = [320, 390, 768, 1440] as const;
const locales = ["en", "ar"] as const;
const themes = ["light", "dark"] as const;

async function setAppearance(
  page: Page,
  locale: "en" | "ar",
  theme: "light" | "dark",
) {
  await page.evaluate(
    ({ locale, theme }) => {
      localStorage.setItem("vaylet_dashboard_locale", locale);
      localStorage.setItem("vaylet_dashboard_theme", theme);
      dispatchEvent(new Event("vaylet-dashboard-locale-change"));
      dispatchEvent(new Event("vaylet-dashboard-theme-change"));
    },
    { locale, theme },
  );
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    locale === "ar" ? "rtl" : "ltr",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function checkGeometry(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector<HTMLElement>(".shell-main");
    const top = document.querySelector(".topbar")?.getBoundingClientRect();
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return (
        box.width > 0 &&
        box.height > 0 &&
        css.display !== "none" &&
        css.visibility !== "hidden"
      );
    };
    const fields = Array.from(
      document.querySelectorAll(
        "input:not([type='hidden']),select,textarea",
      ),
    ).filter(visible);
    const unlabeled = fields.filter((element) => {
      const input = element as HTMLInputElement;
      return !(
        input.labels?.length ||
        input.getAttribute("aria-label") ||
        input.getAttribute("aria-labelledby")
      );
    });
    return {
      viewport: innerWidth,
      rootScroll: root.scrollWidth,
      rootClient: root.clientWidth,
      shellScroll: shell?.scrollWidth ?? null,
      shellClient: shell?.clientWidth ?? null,
      topbarLeft: top?.left ?? null,
      unlabeled: unlabeled.map((item) => item.outerHTML.slice(0, 200)),
    };
  });
}

for (const locale of locales) {
  for (const theme of themes) {
    for (const width of widths) {
      test(`Option C production Location: ${locale}/${theme}/${width}`, async ({
        page,
      }) => {
        const failures: string[] = [];
        page.on("pageerror", (error) => failures.push(error.message));
        await page.setViewportSize({ width, height: 900 });
        await mockPresenceMap(page);
        const fixture = new PresenceFixture("LM");
        await fixture.open(page);
        await setAppearance(page, locale, theme);

        await expect(page).toHaveURL(/\/policies$/u);
        await expect(page.locator(".sidebar")).toHaveCount(1);
        await expect(page.locator(".topbar")).toHaveCount(1);
        const section = page.getByTestId("shift-presence");
        await expect(section).toBeVisible();
        await expect(
          section.getByRole("heading", {
            name:
              locale === "ar"
                ? "التحقق من الحضور للمناوبة"
                : "Shift Presence",
          }),
        ).toBeVisible();

        // Integration gate: never pass against the old settings/table layout.
        const layout = section.getByTestId("shift-presence-map-first-layout");
        await expect(layout).toHaveAttribute("data-active-view", "overview");
        await expect(layout.getByTestId("presence-view-overview")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(layout.getByTestId("presence-view-zones")).toBeVisible();
        await expect(layout.getByTestId("presence-view-policy")).toBeVisible();
        await expect(layout.getByTestId("presence-view-exceptions")).toBeVisible();
        await expect(layout.getByTestId("presence-view-setup")).toBeVisible();
        await expect(
          section.getByRole("button", {
            name: locale === "ar" ? /^مساعدة:/u : /^Help:/u,
          }).first(),
        ).toBeVisible();
        const help = section.getByRole("button", {
          name: locale === "ar" ? /^مساعدة:/u : /^Help:/u,
        }).first();
        await help.click();
        await expect(page.getByRole("dialog").last()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(help).toBeFocused();

        const dimensions = await checkGeometry(page);
        expect(dimensions.rootScroll).toBeLessThanOrEqual(
          dimensions.rootClient + 1,
        );
        expect(dimensions.unlabeled).toEqual([]);
        expect(dimensions.topbarLeft).toBeGreaterThanOrEqual(-1);
        const tabOrder: string[] = [];
        for (let i = 0; i < 12; i += 1) {
          await page.keyboard.press("Tab");
          tabOrder.push(
            await page.evaluate(() => document.activeElement?.tagName ?? ""),
          );
        }
        expect(tabOrder.some((tag) => tag !== "BODY")).toBe(true);
        expect(fixture.writes).toEqual([]);
        expect(failures).toEqual([]);
        mkdirSync(join(evidence, "visual"), { recursive: true });
        await page.evaluate(async () => {
          await document.fonts.ready;
          document.scrollingElement?.scrollTo(0, 0);
        });
        await page.screenshot({
          path: join(evidence, "visual", `${locale}-${theme}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  }
}

test("Company policy-only tab and Company Admin Location tab stay distinct", async ({
  page,
}) => {
  const fixture = new PresenceFixture("CA");
  await fixture.open(page, true);
  const section = page.getByTestId("shift-presence");
  await expect(section.locator("[data-presence-field]")).toHaveCount(4);
  await expect(section.getByTestId("presence-zones")).toHaveCount(0);
  await expect(section.getByTestId("presence-exceptions")).toHaveCount(0);
  await expect(
    section.getByTestId("shift-presence-map-first-layout"),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Location Overrides" }).click();
  await expect(
    section.getByTestId("shift-presence-map-first-layout"),
  ).toHaveCount(1);
  expect(fixture.writes).toEqual([]);
});
