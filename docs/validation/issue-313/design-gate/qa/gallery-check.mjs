/* The gallery is not the production Dashboard, but must correctly embed all
   four offline prototypes and relay EN/AR, themes and device-width selection.
   Usage: node gallery-check.mjs PRIME-DESIGN-GATE-FOLDER */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? ".");
const candidates = [process.env.VAYLET_DEPS_ROOT, process.cwd(),
  resolve(root, "../../../../../../"), "D:/kndoom/valet-platform"].filter(Boolean);
const depsRoot = candidates.find((dir) =>
  existsSync(join(dir, "apps/dashboard/node_modules/@playwright/test")) &&
  existsSync(join(dir, "apps/dashboard/package.json")));
if (!depsRoot) throw new Error("Set VAYLET_DEPS_ROOT to a checkout with @playwright/test installed");
const deps = createRequire(join(depsRoot, "apps/dashboard/package.json"));
const { chromium } = deps("@playwright/test");
const scratch = mkdtempSync(join(tmpdir(), "issue313-gallery-"));
const results = [];
let browser;
try {
  browser = await chromium.launchPersistentContext(join(scratch, "profile"), {
    channel: "chromium", headless: true, viewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(root, "index.html")).href);
  assert.equal(await page.locator(".option").count(), 4, "four gallery options");
  for (const mode of [
    { lang: "en", theme: "light", viewport: "desktop" },
    { lang: "ar", theme: "dark", viewport: "mobile" },
  ]) {
    await page.locator("#lang").selectOption(mode.lang);
    await page.locator("#theme").selectOption(mode.theme);
    await page.locator("#viewport").selectOption(mode.viewport);
    for (let i = 0; i < 4; i++) {
      const card = page.locator(".option").nth(i);
      await card.scrollIntoViewIfNeeded();
      const frame = card.locator("iframe.frame");
      const source = await frame.getAttribute("src");
      assert.match(source, new RegExp("option-" + (i + 1) + "-"));
      assert.ok(source.includes("lang=" + mode.lang) &&
        source.includes("theme=" + mode.theme), "gallery forwards language/theme");
      assert.equal(await frame.evaluate((node) => node.classList.contains("mobile")),
        mode.viewport === "mobile", "gallery adjusts mock device width");
      const child = frame.contentFrame();
      await child.locator('[data-testid="customer-feedback-section"]').waitFor({ timeout: 12000 });
      const locale = await child.locator("html").evaluate((node) => ({
        lang: node.lang, dir: node.dir, theme: node.dataset.theme,
      }));
      assert.equal(locale.lang, mode.lang);
      assert.equal(locale.dir, mode.lang === "ar" ? "rtl" : "ltr");
      assert.equal(locale.theme, mode.theme);
      const href = await card.locator("a.open").getAttribute("href");
      assert.ok(href.startsWith(source.split("?")[0]), "open link targets same option as iframe");
      assert.ok(href.includes("lang=" + mode.lang) && href.includes("theme=" + mode.theme),
        "open link inherits language/theme");
      results.push({ option: i + 1, mode, ...locale, status: "PASS" });
    }
  }
} finally {
  if (browser) await browser.close();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: "PASS", checks: results.length,
  scope: "offline gallery iframe loading, propagated presentation and matching open links",
  results }, null, 2));
