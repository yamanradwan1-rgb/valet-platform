import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { snapshot, checkSnap } from "./preview-snapshot.mjs";
export function createPreviewCases({ failures, pending, evidence, interactions, screenshots }) {
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
  checkSnap(record, reference, failures, pending);
  const screenshotRequired = native
    ? mode.lang === "ar" && mode.theme === "dark" && mode.width === 768
    : (mode.lang === "en" && mode.theme === "light" && [390, 1440].includes(mode.width))
      || (mode.lang === "ar" && mode.theme === "dark" && [390, 1440].includes(mode.width))
      || (mode.lang === "ar" && mode.theme === "light" && mode.width === 320);
  if (screenshotRequired) {
    if (!native && mode.lang === "en" && mode.theme === "light" && mode.width === 1440) {
      await page.screenshot({
        path: join(screenshots, "option-" + option + "-shell-en-light-1440.png"),
        animations: "disabled", fullPage: false,
      });
    }
    await screenshotScrollableMain(page, join(screenshots, "option-" + option + "-" + id + ".png"));
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
  const expected = await page.evaluate(() => window.VAYLET313.selectData({
    role: "company", location: "all", period: "sep", state: "live",
  }));
  const dataEvidence = await root.evaluate((el) => ({
    score: el.querySelector('[data-testid="feedback-avg"]')?.textContent?.trim() ?? null,
    rated: el.querySelector('[data-testid="feedback-sample-count"]')?.textContent?.trim() ?? null,
    eligible: el.querySelector('[data-testid="feedback-eligible-count"]')?.textContent?.trim() ?? null,
    distribution: el.querySelector('[data-testid="feedback-distribution"]')?.innerText ?? null,
    recent: el.querySelector('[data-testid="feedback-recent-list"]')?.innerText ?? null,
    content: el.querySelector("[data-feedback-content]")?.innerText ?? el.innerText,
  }));
  if (!dataEvidence.content.includes(expected.average.toFixed(2))) {
    failures.push("option " + option + ": visible average does not equal shared fixture " +
      expected.average.toFixed(2));
  }
  if (dataEvidence.rated && Number(dataEvidence.rated.replaceAll(",", "")) !== expected.rated)
    failures.push("option " + option + ": rated sample figure differs from shared fixture");
  if (dataEvidence.eligible && Number(dataEvidence.eligible.replaceAll(",", "")) !== expected.eligible)
    failures.push("option " + option + ": eligible sample figure differs from shared fixture");
  if (dataEvidence.distribution && !expected.counts.every((count) =>
    dataEvidence.distribution.includes(String(count)))) {
    failures.push("option " + option + ": distribution content does not display shared fixture counts");
  }
  if (dataEvidence.recent) {
    const visibleRefs = [...dataEvidence.recent.matchAll(/DEMO-VISIT-\d+/gu)].map((item) => item[0]);
    if (!visibleRefs.every((ref) => expected.records.some((item) => item.reference === ref)))
      failures.push("option " + option + ": recent visit reference outside authorized shared fixture");
  }
  cases.push({ mode: "live-data", sample: expected.rated + "/" + expected.eligible,
    average: expected.average, averageVisible: dataEvidence.score });
  for (const state of ["empty", "none", "loading", "error", "denied"]) {
    await feedbackControl("state").focus();
    await feedbackControl("state").selectOption(state);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-feedback-control"));
    if (focused !== "state")
      failures.push("option " + option + ": keyboard state-select focus lost after " + state);
    const sample = await root.evaluate((el) => ({
      state: el.dataset.feedbackState, text: el.innerText,
      visitRows: el.querySelectorAll('tr, [data-rating-row]').length,
      score: el.querySelector('[data-testid="feedback-avg"]')?.textContent?.trim() ?? null,
    }));
    cases.push({ mode: state, state: sample.state, textLength: sample.text.length,
      visitRows: sample.visitRows });
    if (sample.state !== state) failures.push("option " + option + ": state " + state + " not applied");
    if (/DEMO-VISIT-\d+/u.test(sample.text))
      failures.push("option " + option + ": stale visit rating text remains after " + state);
    if (sample.score && /3[.,]91/u.test(sample.score))
      failures.push("option " + option + ": stale September average visible during " + state);
    if (state === "loading" && !/Loading|جارٍ|loading/u.test(sample.text))
      failures.push("option " + option + ": loading state has no readable status");
    if (state === "denied" && !/denied|غير متاحة|رفض/u.test(sample.text))
      failures.push("option " + option + ": access-denied state has no readable status");
    if (state === "none" && !/No eligible|لا توجد زيارات|Not available|—/u.test(sample.text))
      failures.push("option " + option + ": no-eligible state lacks truthful denominator");
    if (state === "empty" && !/No ratings|لا توجد تقييمات|Not available|—/u.test(sample.text))
      failures.push("option " + option + ": no-rated state lacks empty explanation");
  }
  await feedbackControl("state").focus();
  await feedbackControl("state").selectOption("live");
  if (await page.evaluate(() => document.activeElement?.getAttribute("data-feedback-control")) !== "state")
    failures.push("option " + option + ": state-control focus lost after returning to live");
  await feedbackControl("period").focus();
  await feedbackControl("period").selectOption("oct");
  if (await page.evaluate(() => document.activeElement?.getAttribute("data-feedback-control")) !== "period")
    failures.push("option " + option + ": period-select focus lost after October selection");
  const october = await root.evaluate((el) => el.dataset.feedbackPeriod);
  if (october !== "2026-10")
    failures.push("option " + option + ": period change did not change fixture period " + october);
  const octText = await root.evaluate((el) =>
    (el.querySelector("[data-feedback-content]") ?? el).innerText);
  const octAverage = await page.evaluate(() =>
    window.VAYLET313.selectData({ period: "oct" }).average.toFixed(2));
  if (!octText.includes(octAverage))
    failures.push("option " + option + ": new period aggregate average " +
      octAverage + " not displayed");
  await feedbackControl("role").focus();
  await feedbackControl("role").selectOption("manager");
  if (await page.evaluate(() => document.activeElement?.getAttribute("data-feedback-control")) !== "role")
    failures.push("option " + option + ": role-select focus lost after manager selection");
  const role = await root.evaluate((el) => ({
    role: el.dataset.feedbackRole, location: el.dataset.feedbackLocation,
    text: (el.querySelector('[data-testid="feedback-recent-list"]')
      ?? el.querySelector("[data-feedback-content]") ?? el).innerText,
  }));
  if (role.role !== "manager" || role.location !== "main" ||
    !(await feedbackControl("location").isDisabled())) {
    failures.push("option " + option + ": manager scope not constrained to authorized Main Garage");
  }
  if (role.text.includes("North Garage"))
    failures.push("option " + option + ": unauthorized North Garage visible inside manager's feedback data");
  const authorizedRefs = await page.evaluate(() => window.VAYLET313.selectData({
    role: "manager", location: "north", period: "oct", state: "live",
  }).records.map((item) => item.reference));
  const visibleRefs = [...role.text.matchAll(/DEMO-VISIT-\d+/gu)].map((m) => m[0]);
  if (!visibleRefs.every((ref) => authorizedRefs.includes(ref)))
    failures.push("option " + option + ": manager recent reference outside authorized Main Garage data");
  cases.push({ mode: "manager-oct", role: role.role, location: role.location,
    period: october, visibleFeedbackText: role.text.slice(0, 1600) });
  const localeButton = page.locator("#locale-toggle");
  if (await localeButton.count()) {
    await localeButton.click();
    const ar = await page.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
    }));
    if (ar.lang !== "ar" || ar.dir !== "rtl")
      failures.push("option " + option + ": language toggle did not switch to RTL/Arabic");
    if (!(await root.innerText()).includes("تقييمات العملاء"))
      failures.push("option " + option + ": locale changed but feedback heading remained untranslated");
    cases.push({ mode: "ar-toggle", ...ar });
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


return { recordPage, interact };
}
