import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { enterInspector, inspector } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";

const out = join(process.cwd(), "../../docs/validation/issue304-w6/zoom-final");
const extension = join(out, "isolated-tab-zoom-extension");

const api = String.raw`
chrome.runtime.onInstalled.addListener(() => {});
`;

// chrome.tabs.setZoom is Chrome's genuine per-tab host zoom API. It changes
// layout viewport CSS pixels, unlike CDP Emulation.setPageScaleFactor pinch.
function prepareExtension() {
  mkdirSync(extension, { recursive: true });
  writeFileSync(join(extension, "manifest.json"), JSON.stringify({
    manifest_version: 3, name: "VAYLET Issue304 isolated page-zoom verification",
    version: "1.0.0", permissions: ["tabs"],
    background: { service_worker: "background.js" },
  }, null, 2));
  writeFileSync(join(extension, "background.js"), api);
}

function metrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    innerWidth, clientWidth: document.documentElement.clientWidth,
    outerWidth, devicePixelRatio, visualScale: visualViewport?.scale ?? null,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

test("Issue304 authentic Chromium browser tab zoom 200% reflows /keys", async () => {
  prepareExtension();
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3003";
  const profile = join(out, "disposable-zoom-profile");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, baseURL,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--window-size=900,900",
    ],
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await issue304Fixture().install(page);
    await enterInspector(page);
    const before = await metrics(page);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const result = await worker.evaluate(async (url) => {
      const tabsAPI = (globalThis as unknown as { chrome: { tabs: {
        query(options: object): Promise<Array<{ id?: number; url?: string }>>;
        getZoom(tabId: number): Promise<number>;
        setZoom(tabId: number, factor: number): Promise<void>;
      } } }).chrome.tabs;
      const tabs = await tabsAPI.query({});
      const tab = tabs.find((candidate) => candidate.url?.startsWith(url));
      if (tab?.id === undefined) throw new Error("The isolated /keys tab is unavailable to the zoom extension");
      await tabsAPI.setZoom(tab.id, 2);
      return { id: tab.id, reportedZoom: await tabsAPI.getZoom(tab.id) };
    }, baseURL);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(before.innerWidth * 0.60);
    const after = await metrics(page);
    mkdirSync(out, { recursive: true });
    await page.screenshot({ path: join(out, "native-tab-zoom200.png"), animations: "disabled" });
    writeFileSync(join(out, "native-tab-zoom200.json"), JSON.stringify({
      method: "Chrome extension chrome.tabs.setZoom: official browser tab host zoom",
      source: "synthetic fixture /keys", before, after, reported: result.reportedZoom,
      note: "No CSS zoom, viewport-size emulation, or CDP pinch scale used",
    }, null, 2));
    expect(result.reportedZoom).toBe(2);
    expect(after.clientWidth).toBeLessThanOrEqual(before.clientWidth * 0.60);
    expect(Math.abs(after.outerWidth - before.outerWidth)).toBeLessThanOrEqual(12);
    const spots = inspector(page).locator('[data-c-family="spots"]');
    await spots.focus();
    await page.keyboard.press("Enter");
    await expect(spots).toHaveAttribute("aria-pressed", "true");
    await worker.evaluate(async (tabId) => {
      const tabsAPI = (globalThis as unknown as { chrome: { tabs: {
        setZoom(id: number, factor: number): Promise<void>;
      } } }).chrome.tabs;
      await tabsAPI.setZoom(tabId, 1);
    }, result.id);
  } finally {
    await context.close();
  }
});
