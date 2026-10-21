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

function similarCss(a, b, path = "") {
  if (a == null || b == null) return ["baseline comparison missing " + path];
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return ["changed array size " + path];
    return a.flatMap((item, index) => similarCss(item, b[index], path + "[" + index + "]"));
  }
  if (typeof a !== "object") {
    return a === b ? [] : [path + ": " + JSON.stringify(b) + " vs baseline " + JSON.stringify(a)];
  }
  return Object.keys(a).flatMap((key) => {
    const candidate = path ? path + "." + key : key;
    if (typeof a[key] === "object" && a[key] !== null && !Array.isArray(a[key]))
      return similarCss(a[key], b[key], candidate);
    return similarCss(a[key], b[key], candidate);
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    function exact(selector) {
      return Array.from(document.querySelectorAll(selector));
    }
    const grid = document.querySelector('[data-testid="analytics-card-grid"]')
      ?? document.querySelector(".cards");
    const cards = exact('[data-testid="analytics-metric-card"]');
    const charts = document.querySelector('[data-testid="analytics-chart-grid"]')
      ?? document.querySelector(".charts");
    const panels = exact('[data-testid="analytics-chart-panel"]');
    const feedback = document.querySelector('[data-testid="customer-feedback-section"]')
      ?? document.querySelector("#customer-feedback")
      ?? document.querySelector(".customer-feedback");
    const rect = (node) => node ? node.getBoundingClientRect().toJSON() : null;
    const css = (node, fields) => node ? Object.fromEntries(fields.map((field) =>
      [field, getComputedStyle(node).getPropertyValue(field).trim()])) : null;
    const cardCss = cards.map((card) => ({
      card: css(card, ["padding", "border-radius", "background-color", "border-color", "min-width"]),
      value: css(card.querySelector('[data-testid="analytics-card-value"]'), ["font-size", "line-height", "font-weight"]),
      label: css(card.querySelector('[data-testid="analytics-card-label"]'), ["font-size", "line-height", "font-weight"]),
    }));
    const labels = cards.map((card) =>
      card.querySelector('[data-testid="analytics-card-label"]')?.textContent?.trim() ?? "");
    const focusables = exact('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],summary,[tabindex="0"]')
      .filter((item) => item.getClientRects().length && getComputedStyle(item).visibility !== "hidden").length;
    const html = document.documentElement;
    const content = document.querySelector("main") ?? document.body;
    return {
      lang: html.lang, dir: html.dir, theme: html.dataset.theme ?? null,
      title: document.querySelector("h1")?.textContent?.trim() ?? null,
      bodyText: content.innerText,
      cardCount: cards.length, labels, panelCount: panels.length,
      frame: {
        innerWidth, dpr: devicePixelRatio,
        visualScale: visualViewport?.scale ?? null,
        cssZoom: html.style.zoom,
        rootScroll: html.scrollWidth, rootClient: html.clientWidth,
        bodyScroll: document.body.scrollWidth,
      },
      shell: {
        sidebar: Boolean(document.querySelector(".sidebar, .shell-sidebar, [data-testid='dashboard-sidebar']")),
        topbar: Boolean(document.querySelector(".topbar, .shell-topbar, [data-testid='dashboard-topbar']")),
      },
      geometry: { grid: rect(grid), feedback: rect(feedback), charts: rect(charts),
        cards: cards.map(rect), chartPanels: panels.map(rect) },
      css: {
        grid: css(grid, ["display", "gap", "grid-template-columns"]),
        cards: cardCss,
        charts: css(charts, ["display", "gap", "grid-template-columns"]),
        panels: panels.map((p) => css(p, ["padding", "border-radius", "background-color", "border-color"])),
      },
      focusables, visibleFeedback: Boolean(feedback && feedback.getClientRects().length),
      frozenHtml: {
        header: document.querySelector('[data-testid="md05-analytics-page"] > .header')?.outerHTML ?? null,
        cards: grid?.outerHTML ?? null,
        charts: charts?.outerHTML ?? null,
      },
      feedbackHeadings: feedback
        ? [...feedback.querySelectorAll("h2,h3,h4")].map((h) => h.textContent?.trim())
        : [],
      interactiveCount: feedback
        ? feedback.querySelectorAll("button,select,input,summary,a[href]").length
        : 0,
    };
  });
}

function checkSnap(record, baseline) {
  const { sample: v, mode, option } = record;
  const problems = [...record.problems];
  const uncertainties = [...record.uncertainties];
  const originalEn = ["Cars Handled", "Avg. Retrieval Wait", "SLA Compliance", "Incidents"];
  const originalAr = ["السيارات المُنجزة", "متوسط انتظار الاسترجاع", "الالتزام باتفاقية الخدمة", "الحوادث"];
  if (v.cardCount !== 4) problems.push("original KPI cards expected exactly four; got " + v.cardCount);
  if (v.panelCount !== 2) problems.push("original charts expected exactly two; got " + v.panelCount);
  if (v.cardCount === 4 && JSON.stringify(v.labels) !== JSON.stringify(mode.lang === "ar" ? originalAr : originalEn))
    problems.push("original KPI order or locale differs: " + v.labels.join(" | "));
  if (v.lang !== mode.lang || v.dir !== (mode.lang === "ar" ? "rtl" : "ltr"))
    problems.push("locale/dir failed " + v.lang + "/" + v.dir);
  if (v.theme && v.theme !== mode.theme) problems.push("dark/light theme not applied");
  if (mode.lang === "ar" && !/[\u0600-\u06ff]/u.test(v.bodyText))
    problems.push("Arabic content not translated");
  if (!v.visibleFeedback) problems.push("Customer Feedback section missing/not visible");
  if (!v.shell.sidebar || !v.shell.topbar)
    uncertainties.push("shell must be manually compared; canonical sidebar/topbar hooks not found");
  const { grid, feedback, charts } = v.geometry;
  if (grid && feedback && charts) {
    if (grid.bottom > feedback.top + 3 || feedback.bottom > charts.top + 3)
      problems.push("insertion order cards -> feedback -> charts violated");
  } else problems.push("missing geometry hooks for original cards/feedback/charts");
  if (mode.width / (record.native ? 2 : 1) >= 320 && v.frame.rootScroll > v.frame.rootClient + 1)
    problems.push("horizontal root overflow " + v.frame.rootScroll + "/" + v.frame.rootClient);
  if (v.focusables < 2) problems.push("fewer than two visible keyboard controls");
  if (!/DEMO|Illustrative|تجريبية|توضيحية/u.test(v.bodyText)) problems.push("synthetic data disclosure not visible");
  if (/\bNPS\b|\bCSAT\b|sentiment|Google rating|AI review|تحليل المشاعر/iu.test(v.bodyText))
    problems.push("unapproved inferred metric or rating source visible");
  if (/\b(?:\+?\d{1,3}[- .]?)?\d{8,13}\b/u.test(v.bodyText))
    uncertainties.push("long numeric token visible; review for PII false-positive");
  if (baseline && v.cardCount === 4 && v.panelCount === 2) {
    problems.push(...similarCss({cards:baseline.css.cards,panels:baseline.css.panels},
      {cards:v.css.cards,panels:v.css.panels}).map((x) => "frozen CSS: " + x));
    for (const name of ["cards", "charts"]) {
      if (v.frozenHtml[name] !== baseline.frozenHtml[name])
        problems.push("frozen " + name + " DOM changed against same-period baseline");
    }
    if (v.frozenHtml.header !== baseline.frozenHtml.header)
      problems.push("frozen Analytics header DOM changed against baseline");
  } else if (!baseline && mode.lang === "en" && mode.theme === "light" && mode.width === 1440
    && !record.native) uncertainties.push("no rendered baseline yet; frozen CSS comparison unavailable");
  record.problems = problems;
  record.uncertainties = uncertainties;
  for (const error of problems) failures.push("option " + option + " " + record.id + ": " + error);
  for (const unknown of uncertainties) pending.push("option " + option + " " + record.id + ": " + unknown);
}

async function recordPage(page, option, mode, native, reference, zoomWorker, source) {
  await page.setViewportSize({ width: mode.width, height: 900 });
  const uri = pathToFileURL(source).href + "?lang=" + mode.lang + "&theme=" + mode.theme;
  await page.goto(uri, { waitUntil: "load" });
  await page.waitForTimeout(75);
  let verifiedZoom = null;
  let tabId = null;
  if (native) {
    tabId = await zoomWorker.evaluate(async (hint) => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((tab) => tab.url && decodeURI(tab.url).includes(hint))?.id ?? null;
    }, basename(source));
    if (tabId !== null) {
      verifiedZoom = await zoomWorker.evaluate(async (id) => {
        await chrome.tabs.setZoom(id, 2);
        return chrome.tabs.getZoom(id);
      }, tabId);
    }
  } else {
    tabId = await zoomWorker.evaluate(async (hint) => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((tab) => tab.url && decodeURI(tab.url).includes(hint))?.id ?? null;
    }, basename(source));
    if (tabId !== null) await zoomWorker.evaluate(async (id) => chrome.tabs.setZoom(id, 1), tabId);
  }
  const sample = await snapshot(page);
  const id = mode.lang + "-" + mode.theme + "-physical" + mode.width + (native ? "-native200" : "-100");
  const record = { option, id, mode, native, verifiedZoom, sample, problems: [], uncertainties: [] };
  if (native) {
    if (verifiedZoom !== 2) {
      record.problems.push("real tab native zoom not verified: " + verifiedZoom);
    } else if (sample.frame.cssZoom || sample.frame.visualScale !== 1) {
      record.problems.push("unexpected CSS/pinch zoom; native tab zoom proof contaminated");
    } else if (Math.abs(sample.frame.innerWidth - mode.width / 2) > 1) {
      record.problems.push("effective CSS width incorrect: " + sample.frame.innerWidth);
    }
  }
  if (!native && (sample.frame.cssZoom || sample.frame.visualScale !== 1))
    record.problems.push("unexpected CSS/pinch zoom");
  if (sample.focusables > 0) {
    await page.keyboard.press("Tab");
    record.keyboard = await page.evaluate(() => {
      const el = document.activeElement;
      const rect = el?.getBoundingClientRect();
      const css = el ? getComputedStyle(el) : null;
      return {
        tag: el?.tagName ?? null, visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        inViewport: Boolean(rect && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight),
        focusVisible: el?.matches(":focus-visible") ?? false,
        outlineStyle: css?.outlineStyle ?? null,
        outlineWidth: css?.outlineWidth ?? null,
        boxShadow: css?.boxShadow ?? null,
      };
    });
    if (!record.keyboard.visible || !record.keyboard.inViewport)
      record.problems.push("keyboard Tab focus outside visible viewport");
    if (record.keyboard.focusVisible && record.keyboard.outlineStyle === "none"
      && record.keyboard.boxShadow === "none")
      record.uncertainties.push("focus-visible style not proven on initial tab stop");
  }
  checkSnap(record, reference);
  const screenshotRequired = native
    ? mode.lang === "ar" && mode.theme === "dark" && mode.width === 768
    : (mode.lang === "en" && mode.theme === "light" && [390, 1440].includes(mode.width))
      || (mode.lang === "ar" && mode.theme === "dark" && [390, 1440].includes(mode.width))
      || (mode.lang === "ar" && mode.theme === "light" && mode.width === 320);
  if (screenshotRequired) {
    await page.screenshot({
      path: join(screenshots, "option-" + option + "-" + id + ".png"),
      animations: "disabled", fullPage: true,
    });
  }
  evidence.push(record);
}

async function interact(page, option, source) {
  const cases = [];
  const uri = pathToFileURL(source).href + "?lang=en&theme=light";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(uri);
  const root = page.locator('[data-testid="customer-feedback-section"], #customer-feedback, .customer-feedback').first();
  if (!(await root.count())) {
    failures.push("option " + option + ": no feedback root for interaction audit");
    return;
  }
  const feedbackControl = (name) => root.locator('select[data-feedback-control="' + name + '"]');
  if ((await feedbackControl("state").count()) === 0) {
    failures.push("option " + option + ": no shared state control in preview");
    return;
  }
  const live = await root.evaluate((el) => ({
    state: el.dataset.feedbackState, role: el.dataset.feedbackRole,
    location: el.dataset.feedbackLocation, period: el.dataset.feedbackPeriod,
  }));
  if (live.state !== "live" || live.role !== "company" || live.location !== "all"
    || live.period !== "2026-09") {
    failures.push("option " + option + ": default shared fixture state incorrect " + JSON.stringify(live));
  }
  cases.push({ mode: "live", ...live });
  for (const state of ["empty", "none", "loading", "error", "denied"]) {
    await feedbackControl("state").selectOption(state);
    const sample = await root.evaluate((el) => ({
      state: el.dataset.feedbackState, text: el.innerText,
      visitRows: el.querySelectorAll('tr, [data-rating-row]').length,
    }));
    cases.push({ mode: state, state: sample.state, textLength: sample.text.length,
      visitRows: sample.visitRows });
    if (sample.state !== state) failures.push("option " + option + ": state " + state + " not applied");
    if (/DEMO-VISIT-\d+/u.test(sample.text))
      failures.push("option " + option + ": stale visit rating text remains after " + state);
    if (state === "loading" && !/Loading|جارٍ|loading/u.test(sample.text))
      failures.push("option " + option + ": loading state has no readable status");
    if (state === "denied" && !/denied|غير متاحة|رفض/u.test(sample.text))
      failures.push("option " + option + ": access-denied state has no readable status");
    if (state === "none" && !/No eligible|لا توجد زيارات|Not available|—/u.test(sample.text))
      failures.push("option " + option + ": no-eligible state lacks truthful denominator");
    if (state === "empty" && !/No ratings|لا توجد تقييمات|Not available|—/u.test(sample.text))
      failures.push("option " + option + ": no-rated state lacks empty explanation");
    if (["empty", "denied"].includes(state)) {
      await root.screenshot({
        path: join(screenshots, "option-" + option + "-state-" + state + ".png"),
        animations: "disabled",
      });
    }
  }
  await feedbackControl("state").selectOption("live");
  await feedbackControl("period").selectOption("oct");
  const october = await root.evaluate((el) => el.dataset.feedbackPeriod);
  if (october !== "2026-10")
    failures.push("option " + option + ": period change did not change fixture period " + october);
  await feedbackControl("role").selectOption("manager");
  const role = await root.evaluate((el) => ({
    role: el.dataset.feedbackRole, location: el.dataset.feedbackLocation,
    text: el.innerText,
  }));
  if (role.role !== "manager" || role.location !== "main" ||
    !(await feedbackControl("location").isDisabled())) {
    failures.push("option " + option + ": manager scope not constrained to authorized Main Garage");
  }
  if (role.text.includes("North Garage") && !role.text.includes("North Garage</option>"))
    pending.push("option " + option + ": manager view mentions North Garage; verify whether selector-only or data leak");
  cases.push({ mode: "manager-oct", role: role.role, location: role.location, period: october });
  const localeButton = page.locator("#locale-toggle");
  if (await localeButton.count()) {
    await localeButton.click();
    const ar = await page.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
    }));
    if (ar.lang !== "ar" || ar.dir !== "rtl")
      failures.push("option " + option + ": language toggle did not switch to RTL/Arabic");
    cases.push({ mode: "ar-toggle", ...ar });
    await root.screenshot({ path: join(screenshots, "option-" + option + "-ar-manager-oct.png"),
      animations: "disabled" });
  } else pending.push("option " + option + ": locale toggle not found; query-string locale only verified");
  const darkButton = page.locator('[data-theme-choice="dark"]').first();
  if (await darkButton.count()) {
    await darkButton.click();
    if (await page.locator("html").getAttribute("data-theme") !== "dark")
      failures.push("option " + option + ": dark-theme toggle did not update theme");
    cases.push({ mode: "dark-toggle", theme: await page.locator("html").getAttribute("data-theme") });
  } else pending.push("option " + option + ": theme toggle not found; query-string theme only verified");
  interactions.push({ option, cases });
}

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
  const report = {
    source: "VAYLET #313 standalone design-gate HTML only",
    samples: evidence.length, failures: [...new Set(failures)],
    pending: [...new Set(pending)], interactions, records: evidence,
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
