import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("../evidence/qa/", import.meta.url));

test("measured A/B/C/D density and selected-pane discoverability", async ({ page }) => {
  test.setTimeout(60_000);
  mkdirSync(evidence, { recursive: true });
  const cases = [];
  for (const option of ["a", "b", "c", "d"]) {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${option}?section=company&scenario=company-with-location&lang=en&theme=light`);
      await expect(page.locator(".p321-page")).toBeVisible();
      const metrics = await page.evaluate(() => {
        const box = (selector: string) => {
          const el = document.querySelector<HTMLElement>(selector);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const styles = getComputedStyle(el);
          return { top: Math.round(rect.top), left: Math.round(rect.left),
            width: Math.round(rect.width), height: Math.round(rect.height),
            bottom: Math.round(rect.bottom), visible: styles.display !== "none" && rect.height > 0 };
        };
        const nav = box(".issue321-a-rail,.p321-b-rail,.p321-c-sidebar,.issue321-option-d__rail");
        const pane = box(".issue321-a-panel,.p321-b-workspace,.p321-c-pane,.issue321-option-d__pane");
        const firstSetting = box(".p321-setting-row");
        return { nav, pane, firstSetting, aboveFold: !!(firstSetting && firstSetting.top < innerHeight),
          headingCount: document.querySelectorAll("h1").length,
          localSectionCount: document.querySelectorAll(
            ".issue321-a-link,.p321-b-link,.p321-c-nav-button,.issue321-option-d__nav-button",
          ).length };
      });
      cases.push({ option, width, ...metrics });
    }
  }
  writeFileSync(join(evidence, "layout-results.json"), JSON.stringify({ cases,
    method: "Rendered bounding rectangles at 100%, 900px-tall viewport, EN/light/CA/Company Defaults",
  }, null, 2));
  expect(cases).toHaveLength(16);
});
