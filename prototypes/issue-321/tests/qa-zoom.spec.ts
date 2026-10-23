import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("../evidence/qa/", import.meta.url));
const baseline = JSON.parse(readFileSync(join(evidence, "../baseline/geometry.json"), "utf8"));
const samples = [
  { width: 1440, locale: "en", theme: "light" },
  { width: 768, locale: "ar", theme: "dark" },
  { width: 390, locale: "en", theme: "light" },
  { width: 320, locale: "ar", theme: "dark" },
] as const;

test("focused 160 and 200 percent zoom across A/B/C/D", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(evidence, { recursive: true });
  const cases = [];
  for (const option of ["a", "b", "c", "d"]) {
    for (const { width, locale, theme } of samples) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${option}?section=company&scenario=company-with-location&lang=${locale}&theme=${theme}`);
      await expect(page.locator(".p321-page")).toBeVisible();
      for (const zoom of [1.6, 2]) {
        await page.evaluate((z) => {
          document.documentElement.style.zoom = String(z);
          document.querySelector(".content")?.scrollTo({ top: 0 });
        }, zoom);
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        const id = `${width}-${locale}-${theme}-zoom${Math.round(zoom * 100)}`;
        const reference = baseline.cases.find((entry: { id: string }) => entry.id === id);
        const metrics = await page.evaluate(() => {
          const element = (selector: string) => {
            const el = document.querySelector<HTMLElement>(selector);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              display: style.display, color: style.color, background: style.backgroundColor };
          };
          return { pageWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            innerWidth: innerWidth,
            shell: element(".shell"), sidebar: element(".sidebar"),
            topbar: element(".topbar"), actions: element(".topbar-actions"),
            policyNav: element(".issue321-a-rail,.p321-b-rail,.p321-c-sidebar,.issue321-option-d__rail"),
            policyPane: element(".issue321-a-panel,.p321-b-workspace,.p321-c-pane,.issue321-option-d__pane") };
        });
        const baselineOverflow = reference?.document.scrollWidth > reference?.document.clientWidth + 2;
        const overflow = metrics.pageWidth > metrics.clientWidth + 2;
        await page.screenshot({ path: join(evidence, `${option}-${id}.png`), animations: "disabled" });
        cases.push({ option, id, zoom, overflow, baselineOverflow, inheritedOverflow: overflow && baselineOverflow,
          regressionOverflow: overflow && !baselineOverflow, metrics });
      }
    }
  }
  writeFileSync(join(evidence, "zoom-results.json"), JSON.stringify({ cases,
    total: cases.length,
    regressionOverflowCount: cases.filter(item => item.regressionOverflow).length,
    inheritedOverflowCount: cases.filter(item => item.inheritedOverflow).length,
  }, null, 2));
  expect(cases).toHaveLength(32);
});
