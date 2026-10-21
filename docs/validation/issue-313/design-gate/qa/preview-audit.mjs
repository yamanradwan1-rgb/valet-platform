import { snapshot } from "./preview-snapshot.mjs";
import { createPreviewCases } from "./preview-cases.mjs";
/* Independent design-gate QA; reads local HTML files only.
   Usage: node preview-audit.mjs --preview DIR --output DIR [--option 1] [--quick]
   Dependencies: VAYLET_DEPS_ROOT pointing at a repository with @playwright/test installed.
*/
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const preview = resolve(argument("--preview", "."));
const output = resolve(argument("--output", join(preview, "qa-results")));
const sourceSha = argument("--source-sha", "unverified-source-sha");
const one = argument("--option", null);
const quick = process.argv.includes("--quick");
const names = [
  "option-1-summary-first.html",
  "option-2-insights-first.html",
  "option-3-history-first.html",
  "option-4-balanced.html",
];
const selected = names
  .map((name, i) => ({ name, option: i + 1, path: join(preview, name) }))
  .filter(({ option }) => one === null || option === Number(one));
const candidates = [
  process.env.VAYLET_DEPS_ROOT,
  resolve(preview, "../../../.."),
  resolve(process.cwd()),
  "D:/kndoom/valet-platform",
].filter(Boolean);
const depRoot = candidates.find((root) =>
  existsSync(join(root, "apps", "dashboard", "package.json")) &&
  existsSync(join(root, "apps", "dashboard", "node_modules", "@playwright", "test")));
if (!depRoot) throw new Error("No installed Playwright repository found; set VAYLET_DEPS_ROOT");
const fromRepo = createRequire(join(depRoot, "apps", "dashboard", "package.json"));
let chromium;
try {
  ({ chromium } = fromRepo("@playwright/test"));
} catch (error) {
  throw new Error("Playwright unavailable; specify VAYLET_DEPS_ROOT for an installed repository. " + error);
}

const evidence = [];
const failures = [];
const pending = [];
const interactions = [];
const screenshots = join(output, "screenshots");
mkdirSync(screenshots, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "vaylet313-qa-"));
const extension = join(scratch, "extension");
mkdirSync(extension);
writeFileSync(join(extension, "manifest.json"), JSON.stringify({
  manifest_version: 3, name: "VAYLET 313 native zoom QA", version: "1.0.0",
  permissions: ["tabs"], background: { service_worker: "background.js" },
}));
writeFileSync(join(extension, "background.js"), "chrome.runtime.onInstalled.addListener(() => {});");

const modes = quick
  ? [{ lang: "en", theme: "light", width: 1440 }, { lang: "ar", theme: "dark", width: 390 }]
  : ["en", "ar"].flatMap((lang) =>
      ["light", "dark"].flatMap((theme) =>
        [320, 390, 768, 1440].map((width) => ({ lang, theme, width }))));
const nativeCases = quick
  ? [{ lang: "ar", theme: "dark", width: 768 }]
  : ["en", "ar"].flatMap((lang) =>
      ["light", "dark"].flatMap((theme) =>
        [768, 1440].map((width) => ({ lang, theme, width }))));
const modeKey = (mode, native) =>
  [mode.lang, mode.theme, mode.width, native ? "native200" : "regular100"].join(":");

const { recordPage, interact } = createPreviewCases({ failures, pending, evidence, interactions, screenshots });
let browser;
try {
  browser = await chromium.launchPersistentContext(join(scratch, "profile"), {
    channel: "chromium", headless: true, viewport: { width: 1440, height: 900 },
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension],
  });
  const worker = browser.serviceWorkers()[0] ?? await browser.waitForEvent("serviceworker", { timeout: 15000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const outgoing = [];
  page.on("request", (request) => {
    if (/^https?:\/\//u.test(request.url())) outgoing.push(request.url());
  });
  const baselineSnapshots = new Map();
  const baselinePath = join(preview, "baseline", "current-analytics.html");
  if (existsSync(baselinePath)) {
    for (const mode of modes) {
      await page.setViewportSize({ width: mode.width, height: 900 });
      await page.goto(pathToFileURL(baselinePath).href +
        "?lang=" + mode.lang + "&theme=" + mode.theme);
      baselineSnapshots.set(modeKey(mode, false), await snapshot(page));
      if (mode.lang === "en" && mode.theme === "light" && mode.width === 1440) {
        await page.screenshot({
          path: join(screenshots, "baseline-en-light-1440.png"),
          animations: "disabled", fullPage: true,
        });
      }
    }
    for (const mode of nativeCases) {
      await page.setViewportSize({ width: mode.width, height: 900 });
      await page.goto(pathToFileURL(baselinePath).href +
        "?lang=" + mode.lang + "&theme=" + mode.theme);
      const id = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.find((tab) => tab.url?.includes("current-analytics.html"))?.id ?? null;
      });
      if (id !== null) {
        const z = await worker.evaluate(async (tabId) => {
          await chrome.tabs.setZoom(tabId, 2);
          return chrome.tabs.getZoom(tabId);
        }, id);
        if (z !== 2) pending.push("native baseline zoom could not be confirmed");
      }
      baselineSnapshots.set(modeKey(mode, true), await snapshot(page));
    }
  } else pending.push("baseline/current-analytics.html not found; independent freeze requires baseline screenshot");
  for (const item of selected) {
    if (!existsSync(item.path)) {
      pending.push("option " + item.option + " file missing: " + item.path);
      continue;
    }
    assert.equal(readFileSync(item.path, "utf8").slice(0, 250).toLowerCase().includes("<!doctype html>"), true,
      "standalone valid HTML doctype " + item.option);
    for (const mode of modes) {
      await recordPage(page, item.option, mode, false,
        baselineSnapshots.get(modeKey(mode, false)) ?? null, worker, item.path);
    }
    for (const mode of nativeCases) {
      await recordPage(page, item.option, mode, true,
        baselineSnapshots.get(modeKey(mode, true)) ?? null, worker, item.path);
    }
    await interact(page, item.option, item.path);
  }
  if (outgoing.length) failures.push("HTML attempted external HTTP(s) requests: " + outgoing.join(" | "));
} catch (error) {
  failures.push("audit runtime failed: " + (error?.stack ?? String(error)));
} finally {
  if (browser) await browser.close();
  rmSync(scratch, { recursive: true, force: true });
  const compactRecords = evidence.map(({ sample, ...rest }) => {
    const { frozenHtml, bodyText, feedbackText, ...remaining } = sample;
    return { ...rest, sample: { ...remaining, freezeDOMCompared: Boolean(frozenHtml.cards && frozenHtml.charts) } };
  });
  const report = {
    source: "VAYLET #313 standalone design-gate HTML only", sourceSha,
    samples: evidence.length, failures: [...new Set(failures)],
    pending: [...new Set(pending)], interactions, records: compactRecords,
  };
  writeFileSync(join(output, "preview-audit-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    status: report.failures.length ? "NO-GO" : report.pending.length ? "INCOMPLETE" : "PASS",
    samples: report.samples, failures: report.failures.length, pending: report.pending.length,
    output: join(output, "preview-audit-results.json"),
    highlights: report.failures.slice(0, 15),
  }, null, 2));
}
process.exitCode = failures.length ? 1 : pending.length ? 2 : 0;
