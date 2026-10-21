/* WCAG 2.2 AA targeted calculated foreground/background contrast evidence.
   Reviews common Feedback demo labels, controls, notices and H2/H3 headings
   at EN/light and AR/dark. Other icons/graphics are separately inspected.
   Usage: node contrast-check.mjs PRIME-DESIGN-GATE-FOLDER */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dir = resolve(process.argv[2] ?? ".");
const candidates = [process.env.VAYLET_DEPS_ROOT, process.cwd(),
  resolve(dir, "../../../../../../"), "D:/kndoom/valet-platform"].filter(Boolean);
const depsRoot = candidates.find((root) =>
  existsSync(join(root, "apps/dashboard/node_modules/@playwright/test")) &&
  existsSync(join(root, "apps/dashboard/package.json")));
if (!depsRoot) throw new Error("Set VAYLET_DEPS_ROOT to a checkout with @playwright/test installed");
const { chromium } = createRequire(join(depsRoot, "apps/dashboard/package.json"))("@playwright/test");
const browser = await chromium.launch({ channel: "chromium", headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  for (const option of ["1-summary-first", "2-insights-first", "3-history-first", "4-balanced"]) {
    for (const mode of [{ lang: "en", theme: "light" }, { lang: "ar", theme: "dark" }]) {
      await page.goto(pathToFileURL(join(dir, "option-" + option + ".html")).href +
        "?lang=" + mode.lang + "&theme=" + mode.theme);
      const samples = await page.locator('[data-testid="customer-feedback-section"]').evaluate((root) => {
        function rgba(value) {
          const parts = value.match(/[\d.]+/gu)?.map(Number);
          if (!parts || parts.length < 3) throw new Error("Color cannot be measured: " + value);
          return [...parts.slice(0, 3), parts[3] ?? 1];
        }
        function over(top, below) {
          const a = top[3] + below[3] * (1 - top[3]);
          return a === 0 ? [0, 0, 0, 0] : [
            ...[0, 1, 2].map((i) =>
              (top[i] * top[3] + below[i] * below[3] * (1 - top[3])) / a),
            a,
          ];
        }
        function background(node) {
          let top = [0, 0, 0, 0];
          for (let n = node; n; n = n.parentElement) {
            top = over(top, rgba(getComputedStyle(n).backgroundColor));
            if (top[3] >= .999) return top;
          }
          return over(top, [255, 255, 255, 1]);
        }
        function lum(c) {
          const v = [0, 1, 2].map((i) => {
            const normalized = c[i] / 255;
            return normalized <= .04045 ? normalized / 12.92 :
              ((normalized + .055) / 1.055) ** 2.4;
          });
          return v[0] * .2126 + v[1] * .7152 + v[2] * .0722;
        }
        const nodes = [
          ...root.querySelectorAll(".feedback-demo-field>span,.feedback-demo-field select,.feedback-demo-note,.feedback-demo-label"),
          ...root.querySelectorAll("h2,h3"),
        ].filter((node) => node.getClientRects().length > 0);
        return nodes.map((node) => {
          const computed = getComputedStyle(node);
          const backgroundColor = background(node);
          const foreground = over(rgba(computed.color), backgroundColor);
          const l1 = lum(foreground);
          const l2 = lum(backgroundColor);
          const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
          const px = parseFloat(computed.fontSize);
          const weight = Number(computed.fontWeight);
          const isLarge = px >= 24 || (px >= 18.66 && weight >= 700);
          const threshold = isLarge ? 3 : 4.5;
          return {
            selector: node.className || node.localName,
            text: node.textContent?.trim().slice(0, 90),
            fg: computed.color, bg: backgroundColor.slice(0, 3),
            fontPx: px, fontWeight: weight, threshold,
            ratio: Number(ratio.toFixed(2)), pass: ratio + .001 >= threshold,
          };
        });
      });
      assert.ok(samples.length >= 7, "missing targeted text nodes for " + option);
      results.push({ option, ...mode, samples,
        violations: samples.filter((item) => !item.pass) });
    }
  }
} finally { await browser.close(); }
const failures = results.flatMap((result) => result.violations.map((item) =>
  "option-" + result.option + " " + result.lang + " " + result.theme + " " +
  item.selector + " contrast " + item.ratio + ":" + 1 + " vs " + item.threshold));
console.log(JSON.stringify({
  status: failures.length ? "NO-GO" : "PASS",
  cases: results.length,
  elements: results.reduce((sum, item) => sum + item.samples.length, 0),
  failures, results,
}, null, 2));
if (failures.length) process.exitCode = 1;
