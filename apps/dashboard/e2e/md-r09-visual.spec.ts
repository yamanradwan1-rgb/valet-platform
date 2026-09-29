import { expect, test } from "@playwright/test";
import { standardCompanyFixture } from "./support/md05-analytics-fixtures";
import {
  cards,
  enterR09,
  expectR09Loaded,
  pageRoot,
  routes,
  setLocaleTheme,
} from "./support/md-r09-fixtures";

// The shared period control shifts desktop content while card/panel geometry stays fixed.
for (const route of routes) {
  for (const width of [1440, 480]) {
    for (const locale of ["en", "ar"] as const) {
      for (const dark of [false, true]) {
        test(`${route} ${width} ${locale} ${dark ? "dark" : "light"} measured reference geometry`, async ({
          page,
        }, info) => {
          await page.setViewportSize({ width: 1440, height: 900 });
          await standardCompanyFixture().install(page);
          await enterR09(page, route);
          await expectR09Loaded(page, route);
          await setLocaleTheme(page, locale, dark);
          await page.setViewportSize({ width, height: 900 });
          const root = pageRoot(page, route);
          const summary = cards(page, route);
          await expect(summary).toHaveCount(4);
          await expect(summary.first()).toHaveCSS("border-radius", "12px");
          await expect(summary.first()).toHaveCSS("padding", "20px");
          await expect(summary.first()).toHaveCSS(
            "background-color",
            dark ? "rgb(13, 21, 47)" : "rgb(255, 255, 255)",
          );
          await expect(summary.first()).toHaveCSS(
            "border-color",
            dark ? "rgb(23, 35, 70)" : "rgb(226, 232, 240)",
          );
          await expect(root.locator("h1")).toHaveCSS("font-size", "24px");
          await expect(root.locator("h1")).toHaveCSS("line-height", "32px");
          const boxes = await summary.evaluateAll((nodes) =>
            nodes.map((node) => {
              const box = node.getBoundingClientRect();
              return {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              };
            }),
          );
          expect(boxes[0]!.width).toBe(width === 1440 ? 267 : 440);
          expect(boxes[0]!.height).toBe(route === "analytics" ? 136 : 124.5);
          if (width === 1440) {
            expect(boxes[0]!.y).toBe(183);
            expect(boxes.every((box) => box.y === boxes[0]!.y)).toBe(true);
          } else {
            expect(boxes.every((box) => box.x === 20)).toBe(true);
            expect(boxes[1]!.y - boxes[0]!.y - boxes[0]!.height).toBe(16);
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBe(width);
          if (route === "analytics") {
            const panels = page.getByTestId("analytics-chart-panel");
            await expect(panels).toHaveCount(2);
            const first = await panels.nth(0).boundingBox();
            const second = await panels.nth(1).boundingBox();
            expect(first!.width).toBe(width === 1440 ? 546 : 440);
            if (width === 1440) {
              expect(first!.y).toBe(343);
              expect(second!.y).toBe(343);
              // Extra height contains required source evidence, not displaced plots.
              const plots = await root
                .locator("svg[role='img']")
                .evaluateAll((nodes) =>
                  nodes.map((node) => node.getBoundingClientRect().y),
                );
              expect(plots[0]).toBe(plots[1]);
            }
            await expect(root.locator("svg[role='img']").first()).toHaveCSS(
              "height",
              "260px",
            );
          } else {
            const panel = root.locator('[class*="breakdownPanel"]');
            await expect(panel).toHaveCount(1);
            if (width === 1440)
              expect((await panel.boundingBox())!.y).toBe(331.5);
            const scroller = root
              .locator('[role="region"][tabindex="0"]')
              .first();
            await scroller.focus();
            await expect(scroller).toBeFocused();
            if (width === 480) {
              const sizes = await scroller.evaluate((node) => ({
                client: node.clientWidth,
                scroll: node.scrollWidth,
              }));
              expect(sizes.scroll).toBeGreaterThan(sizes.client);
            }
          }
          await info.attach("measured-cards", {
            body: JSON.stringify(boxes),
            contentType: "application/json",
          });
          await page.screenshot({
            path: info.outputPath("r09.png"),
            fullPage: true,
          });
        });
      }
    }
  }
}
