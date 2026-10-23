import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("../evidence/qa/", import.meta.url));

test("A/B/C/D live DOM accessibility landmarks, names and targets", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(evidence, { recursive: true });
  const cases = [];
  for (const option of ["a", "b", "c", "d"]) {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of ["en", "ar"]) {
        await page.goto(`/${option}?section=company&scenario=company-with-location&lang=${locale}&theme=light`);
        await expect(page.locator(".p321-page")).toBeVisible();
        const observations = await page.evaluate(() => {
          const visible = (el: HTMLElement) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
          };
          const accessibleName = (el: HTMLElement) => {
            const direct = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent?.trim();
            if (direct) return direct;
            const id = el.id;
            if (id) {
              const label = [...document.querySelectorAll<HTMLLabelElement>("label")]
                .find((node) => node.htmlFor === id);
              if (label) return label.textContent?.trim();
            }
            return el.closest("label")?.textContent?.trim() || "";
          };
          const allIds = [...document.querySelectorAll<HTMLElement>("[id]")].map(el => el.id);
          const duplicateIds = [...new Set(allIds.filter((id, index) => allIds.indexOf(id) !== index))];
          const controls = [...document.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href]")]
            .filter(visible);
          const missingNames = controls.filter(el => !accessibleName(el)).slice(0, 10)
            .map(el => `${el.tagName}.${String(el.className).slice(0, 60)}`);
          const tinyTargets = controls.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width < 23.9 || rect.height < 23.9;
          }).slice(0, 20).map(el => {
            const rect = el.getBoundingClientRect();
            return { label: accessibleName(el).slice(0, 80), tag: el.tagName,
              className: String(el.className).slice(0, 60), width: rect.width, height: rect.height };
          });
          const h1 = [...document.querySelectorAll("h1")].map(el => el.textContent?.trim());
          const mainCount = document.querySelectorAll("main").length;
          const navCount = document.querySelectorAll("nav").length;
          const activeLocal = document.querySelectorAll(
            '.issue321-a-link[aria-current],.p321-b-link[aria-current],.p321-c-nav-button[aria-current],.issue321-option-d__nav-button[aria-current]',
          ).length;
          const modalLabels = [...document.querySelectorAll<HTMLDialogElement>("dialog")]
            .filter(el => !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby"))
            .length;
          return { h1, mainCount, navCount, activeLocal, modalLabels, duplicateIds,
            controls: controls.length, missingNames, tinyTargets };
        });
        cases.push({ option, width, locale, ...observations });
      }
    }
  }
  writeFileSync(join(evidence, "accessibility-results.json"), JSON.stringify({
    method: "Rendered DOM checks; not a full WCAG or screen-reader conformance audit",
    cases,
  }, null, 2));
  expect(cases).toHaveLength(32);
});
