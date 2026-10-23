import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("../evidence/qa/", import.meta.url));
const baseline = JSON.parse(readFileSync(join(evidence, "../baseline/geometry.json"), "utf8"));
const cases: Array<Record<string, unknown>> = [];
const shellSelectors = [
  ".shell", ".sidebar", ".sidebar-brand", ".sidebar-scope",
  ".sidebar-navigation", ".sidebar-utilities", ".topbar",
  ".scope-line", ".topbar-actions", ".content", ".content-inner",
];
const measuredShell = shellSelectors.filter((selector) => selector !== ".content-inner");

type ShellNode = {
  rect: Record<"x" | "y" | "width" | "height", number>;
  display: string;
  background: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  padding: string;
  gap: string;
};
type ShellSnapshot = { nodes?: Record<string, ShellNode | null>; sidebarCollapsed?: string | null };

function shellDiff(reference: ShellSnapshot | undefined, observed: ShellSnapshot) {
  const mismatches: string[] = [];
  for (const selector of measuredShell) {
    const expected = reference?.nodes?.[selector];
    const actual = observed.nodes?.[selector];
    if (!expected || !actual) {
      mismatches.push(`${selector}: missing in ${!expected ? "baseline" : "prototype"}`);
      continue;
    }
    for (const field of ["x", "y", "width", "height"] as const) {
      const delta = Math.abs(expected.rect[field] - actual.rect[field]);
      if (delta > 1) mismatches.push(`${selector}.${field}: baseline ${expected.rect[field]}, prototype ${actual.rect[field]}`);
    }
    for (const field of ["display", "background", "color", "fontFamily", "fontSize", "padding", "gap"]) {
      if (expected[field] !== actual[field]) mismatches.push(`${selector}.${field}: baseline ${expected[field]}, prototype ${actual[field]}`);
    }
  }
  if (reference?.sidebarCollapsed !== observed.sidebarCollapsed) mismatches.push("sidebarCollapsed differs");
  return mismatches;
}

test("64 normalized A/B/C/D screenshots, shell geometry, and overflow evidence", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(evidence, { recursive: true });
  for (const option of ["a", "b", "c", "d"]) {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of ["en", "ar"]) {
        for (const theme of ["light", "dark"]) {
          const id = `${width}-${locale}-${theme}-zoom100`;
          const url = `/${option}?section=company&scenario=company-with-location&lang=${locale}&theme=${theme}`;
          await page.goto(url, { waitUntil: "networkidle" });
          await expect(page.locator(".p321-page")).toBeVisible();
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          });
          const metrics = await page.evaluate((selectors) => {
            const nodes = Object.fromEntries(selectors.map((selector) => {
              const el = document.querySelector<HTMLElement>(selector);
              if (!el) return [selector, null];
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return [selector, {
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                display: style.display, background: style.backgroundColor,
                color: style.color, fontFamily: style.fontFamily,
                fontSize: style.fontSize, padding: style.padding, gap: style.gap,
              }];
            }));
            const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
              .filter((el) => {
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return style.position !== "fixed" && style.visibility !== "hidden" &&
                  rect.width > 1 && (rect.right > innerWidth + 2 || rect.left < -2);
              }).slice(0, 12).map((el) => ({
                tag: el.tagName, className: typeof el.className === "string" ? el.className.slice(0, 100) : "",
                left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right),
              }));
            return {
              viewport: { width: innerWidth, height: innerHeight },
              document: { lang: document.documentElement.lang, dir: document.documentElement.dir,
                theme: document.documentElement.dataset.theme,
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth },
              sidebarCollapsed: document.querySelector(".shell")?.getAttribute("data-sidebar-collapsed"),
              activeNavigation: [...document.querySelectorAll<HTMLElement>('.nav-link[aria-current="page"]')]
                .map((node) => node.textContent?.trim()),
              nodes, offenders,
            };
          }, shellSelectors);
          const reference = baseline.cases.find((item: { id: string }) => item.id === id);
          const mismatches = shellDiff(reference, metrics);
          const overflow = metrics.document.scrollWidth > metrics.document.clientWidth + 2;
          const screenshot = join(evidence, `${option}-${id}.png`);
          await page.screenshot({ path: screenshot, animations: "disabled" });
          cases.push({ option, id, screenshot, overflow, baselineOverflow: !!(reference && reference.document.scrollWidth > reference.document.clientWidth + 2),
            shellDiff: mismatches, ...metrics });
        }
      }
    }
  }
  writeFileSync(join(evidence, "matrix-geometry.json"), JSON.stringify({
    baselineSource: baseline.source, description: "Actual rendered Playwright captures; 100% zoom, 900px viewport height",
    cases,
  }, null, 2));
  expect(cases).toHaveLength(64);
});
