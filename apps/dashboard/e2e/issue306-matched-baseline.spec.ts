import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { incidentItem } from "./support/operations-fixtures";
import { enterR08, r08Fixture, r08Path } from "./support/r08-accountability";

/**
 * Matched baseline capture: run this SAME test binary twice against an
 * isolated c883883d server and the exact pushed #306 server, respectively.
 * Evidence is saved under final-baseline/before and final-baseline/after.
 */
const variant = process.env.ISSUE306_VARIANT;
const baseURL = process.env.E2E_BASE_URL;
if (variant !== "before" && variant !== "after") throw new Error("Set ISSUE306_VARIANT=before|after");
if (!baseURL) throw new Error("Set E2E_BASE_URL to the correct isolated source server");

const output = join(process.cwd(), "../../docs/validation/issue-306/final-baseline");
const extension = join(output, "native-zoom-extension");
const onlyCase = process.env.ISSUE306_CASE_ONLY;
if (!onlyCase) throw new Error("Set ISSUE306_CASE_ONLY to run one matched capture per isolated Chromium context");
const profile = join(process.cwd(), "test-results", "issue306-comparison-profile-" + variant + (onlyCase ? "-" + onlyCase : ""));
const reporter = `${"عبدالرحمن".repeat(8)} ${"الخطيب".repeat(8)}`;
const { reporterDisplayName: _reporterField, ...oldIncident } = incidentItem();
const payload = variant === "before"
  ? oldIncident
  : { ...oldIncident, reporterDisplayName: reporter };

const cases = [
  { id: "ar320-css200-dark", locale: "ar", theme: "dark", width: 320, zoom: "css" },
  { id: "en320-100-light", locale: "en", theme: "light", width: 320, zoom: "none" },
  { id: "ar390-100-dark", locale: "ar", theme: "dark", width: 390, zoom: "none" },
  { id: "ar768-css200-dark", locale: "ar", theme: "dark", width: 768, zoom: "css" },
  { id: "en1440-css200-light", locale: "en", theme: "light", width: 1440, zoom: "css" },
  { id: "ar320-native200-dark", locale: "ar", theme: "dark", width: 320, zoom: "native" },
  { id: "en320-native200-light", locale: "en", theme: "light", width: 320, zoom: "native" },
] as const;
const selectedCases = onlyCase ? cases.filter((item) => item.id === onlyCase) : cases;
if (selectedCases.length === 0) throw new Error(`Unknown ISSUE306_CASE_ONLY=${onlyCase}`);

function prepareNativeExtension() {
  mkdirSync(extension, { recursive: true });
  writeFileSync(join(extension, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    name: "VAYLET Issue306 matched baseline native zoom verification",
    version: "1.0.0",
    permissions: ["tabs"],
    background: { service_worker: "background.js" },
  }, null, 2));
  writeFileSync(join(extension, "background.js"),
    "chrome.runtime.onInstalled.addListener(() => {});\n");
}

async function measurements(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), left: +r.left.toFixed(2),
        right: +r.right.toFixed(2), top: +r.top.toFixed(2),
        bottom: +r.bottom.toFixed(2), width: +r.width.toFixed(2),
        height: +r.height.toFixed(2) };
    };
    const textBounds = (element: Element | null) => {
      if (!element) return null;
      const range = document.createRange();
      range.selectNodeContents(element);
      const r = range.getBoundingClientRect();
      return { left: +r.left.toFixed(2), right: +r.right.toFixed(2),
        top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2),
        width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
    };
    const dialog = document.querySelector('[role="dialog"]');
    const factList = Array.from(dialog?.querySelectorAll("div") ?? [])
      .find((node) => typeof node.className === "string" &&
        node.className.split(" ").some((entry) => entry.endsWith("_factList"))) ?? null;
    const drawer = dialog;
    const drawerBody = Array.from(dialog?.querySelectorAll("div") ?? [])
      .find((node) => typeof node.className === "string" &&
        node.className.split(" ").some((entry) => entry.endsWith("_drawerBody"))) ?? null;
    const facts = Array.from(factList?.children ?? []).map((node) => {
      const label = node.querySelector("span");
      const value = node.querySelector("strong");
      const spanStyle = label ? getComputedStyle(label) : null;
      const valueStyle = value ? getComputedStyle(value) : null;
      return {
        label: label?.textContent ?? "",
        value: value?.textContent ?? "",
        rect: rect(node),
        labelRect: rect(label),
        valueRect: rect(value),
        valueTextBounds: textBounds(value),
        valueOverflowWrap: valueStyle?.overflowWrap ?? null,
        valueWordBreak: valueStyle?.wordBreak ?? null,
        valueDirection: valueStyle?.direction ?? null,
        labelFont: spanStyle?.fontFamily ?? null,
        valueFont: valueStyle?.fontFamily ?? null,
      };
    });
    const bodyStyle = drawerBody ? getComputedStyle(drawerBody) : null;
    const listStyle = factList ? getComputedStyle(factList) : null;
    const drawerHeader = Array.from(dialog?.querySelectorAll("div") ?? [])
      .find((node) => typeof node.className === "string" &&
        node.className.split(" ").some((entry) => entry.endsWith("_drawerHeader"))) ?? null;
    const close = drawerHeader?.querySelector("button:last-of-type") ?? null;
    return {
      innerWidth, innerHeight, outerWidth, outerHeight,
      devicePixelRatio, visualScale: visualViewport?.scale ?? null,
      htmlDir: document.documentElement.dir,
      htmlLang: document.documentElement.lang,
      htmlZoom: getComputedStyle(document.documentElement).zoom,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentScrollLeft: document.documentElement.scrollLeft,
      documentFontStatus: document.fonts.status,
      fonts: [...document.fonts].filter((font) => font.status === "loaded")
        .map((font) => ({ family: font.family, weight: font.weight, style: font.style })).slice(0, 15),
      bodyFont: getComputedStyle(document.body).fontFamily,
      activeElement: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? "",
      drawer: rect(drawer),
      drawerBody: rect(drawerBody),
      drawerBodyOverflowX: bodyStyle?.overflowX ?? null,
      drawerBodyOverflowY: bodyStyle?.overflowY ?? null,
      drawerBodyScrollWidth: drawerBody?.scrollWidth ?? null,
      drawerBodyClientWidth: drawerBody?.clientWidth ?? null,
      drawerBodyScrollHeight: drawerBody?.scrollHeight ?? null,
      drawerBodyClientHeight: drawerBody?.clientHeight ?? null,
      drawerBodyScrollTop: drawerBody?.scrollTop ?? null,
      factList: rect(factList),
      factListOverflowX: listStyle?.overflowX ?? null,
      factListScrollWidth: factList?.scrollWidth ?? null,
      factListClientWidth: factList?.clientWidth ?? null,
      close: rect(close ?? null),
      facts,
    };
  });
}

test.setTimeout(300_000);
test("matched original vs #306 Chromium Incidents Details and genuine tab zoom", async () => {
  prepareNativeExtension();
  mkdirSync(join(output, variant), { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, baseURL,
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--window-size=1440,900",
    ],
  });
  const captures: Record<string, unknown> = {};
  try {
    const page = context.pages()[0] ?? await context.newPage();
    const fixture = r08Fixture((path) => path === r08Path("incidents")
      ? { body: { items: [payload], nextCursor: null } }
      : undefined);
    await enterR08(page, "/incidents", fixture);
    const worker = context.serviceWorkers()[0] ??
      await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const tabId = await worker.evaluate(async (url) => {
      const tabs = (globalThis as unknown as { chrome: { tabs: {
        query(args: object): Promise<Array<{ id?: number; url?: string }>>;
      } } }).chrome.tabs;
      const matching = (await tabs.query({})).find((tab) => tab.url?.startsWith(url));
      if (matching?.id === undefined) throw new Error("Native Chrome tab not found");
      return matching.id;
    }, baseURL);
    const setNativeZoom = async (factor: number) => worker.evaluate(async ({ id, factor }) => {
      const tabs = (globalThis as unknown as { chrome: { tabs: {
        setZoom(id: number, factor: number): Promise<void>;
        getZoom(id: number): Promise<number>;
      } } }).chrome.tabs;
      await tabs.setZoom(id, factor);
      return tabs.getZoom(id);
    }, { id: tabId, factor });

    for (const item of selectedCases) {
      console.log(`[matched ${variant}] ${item.id}: reset tab/route`);
      await page.setViewportSize({ width: 1440, height: 900 });
      console.log(`[matched ${variant}] ${item.id}: viewport desktop`);
      await page.goto("/incidents");
      console.log(`[matched ${variant}] ${item.id}: loaded route`);
      await expect(page.getByRole("table")).toBeVisible();
      console.log(`[matched ${variant}] ${item.id}: loaded table`);
      // Theme controls can change accessible labels in Arabic; reset locale
      // while the full desktop header is exposed before each capture.
      if (await page.locator("html").getAttribute("dir") === "rtl")
        await page.getByRole("button", { name: "Language" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      const themeButton = page.getByRole("button", {
        name: item.theme === "dark" ? "Dark" : "Light", exact: true,
      });
      if (await themeButton.getAttribute("aria-pressed") !== "true") await themeButton.click();
      const targetDir = item.locale === "ar" ? "rtl" : "ltr";
      if (await page.locator("html").getAttribute("dir") !== targetDir)
        await page.getByRole("button", { name: "Language" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", targetDir);
      console.log(`[matched ${variant}] ${item.id}: locale/theme ready`);
      await page.setViewportSize({ width: item.width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const unzoomed = await measurements(page);
      let reportedNativeZoom: number | null = null;
      if (item.zoom === "css") await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
      if (item.zoom === "native") {
        reportedNativeZoom = await setNativeZoom(2);
        await expect.poll(() => page.evaluate(() => innerWidth), { timeout: 10000 })
          .toBeLessThan(unzoomed.innerWidth * .65);
      }
      await page.locator("tbody tr").first().getByRole("button").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const first = await measurements(page);
      const folder = join(output, variant);
      await page.screenshot({ path: join(folder, item.id + "-top.png"), animations: "disabled" });
      await dialog.evaluate((node) => {
        const body = Array.from(node.querySelectorAll("div")).find(
          (el) => typeof el.className === "string" && el.className.split(" ").some((x) => x.endsWith("_drawerBody")),
        );
        if (body) body.scrollTop = body.scrollHeight;
      });
      const bottom = await measurements(page);
      await page.screenshot({ path: join(folder, item.id + "-bottom.png"), animations: "disabled" });
      captures[item.id] = { settings: item, reportedNativeZoom, unzoomed, top: first, bottom };
      writeFileSync(join(folder, item.id + ".json"), JSON.stringify(captures[item.id], null, 2));
      console.log(`[matched ${variant}] ${item.id}: saved screenshots and metrics`);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
    writeFileSync(join(output, variant, `${onlyCase}-manifest.json`), JSON.stringify({
      variant, requestedBaseURL: baseURL, sourceSHA: variant === "before"
        ? "c883883df721449b5ca8025ab5cad94cfe5f0ff4"
        : "57975551d6a6896f8e3071742f6c4ccaf5f45310",
      method: "same Chromium/Playwright test binary, matched fixture fields except added reporter",
      nativeZoom: "Chrome tabs.setZoom/getZoom official tab zoom extension",
      profileDir: "temporary untracked Chromium profile",
      cases: Object.keys(captures),
    }, null, 2));
  } finally {
    await context.close();
  }
});
