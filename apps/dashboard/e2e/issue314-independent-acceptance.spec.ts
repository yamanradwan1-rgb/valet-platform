import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { incidentItem, OP_IDS } from "./support/operations-fixtures";
import { enterR08, r08Fixture, r08Path } from "./support/r08-accountability";

// W5-only synthetic acceptance harness. Runs unchanged against a pinned BEFORE
// server and W4's candidate server. Never uses a production API or database.
const variant = process.env.ISSUE314_VARIANT;
const origin = process.env.E2E_BASE_URL;
if (variant !== "before" && variant !== "after") throw new Error("ISSUE314_VARIANT must be before|after");
if (!origin?.startsWith("http://127.0.0.1:") && !origin?.startsWith("http://localhost:")) {
  throw new Error("E2E_BASE_URL must name an isolated local server");
}

const output = join(process.cwd(), "../../docs/validation/issue-314/browser");
const extension = join(output, "native-zoom-extension");
const profile = join(process.cwd(), "test-results", `issue314-w5-${variant}-profile`);
const longReporter = `${"عبدالرحمن".repeat(8)} ${"الخطيب".repeat(8)}`;
const longDescription = `${"Minor mirror inspection required with follow-up notes. ".repeat(6)} ${"وصف تفصيلي ".repeat(8)}`;
const fixture = r08Fixture((path) => path === r08Path("incidents")
  ? { body: { items: [
    { ...incidentItem(), description: longDescription, reporterDisplayName: longReporter },
    { ...incidentItem(), incidentId: OP_IDS.vehicle, reporterDisplayName: null },
  ], nextCursor: null } }
  : undefined);

const cases = [
  { id: "ar320-native200-dark", locale: "ar", theme: "dark", width: 320, zoom: "native" },
  { id: "en320-native200-light", locale: "en", theme: "light", width: 320, zoom: "native" },
  { id: "ar390-native200-light", locale: "ar", theme: "light", width: 390, zoom: "native" },
  { id: "ar320-css200-dark", locale: "ar", theme: "dark", width: 320, zoom: "css" },
  { id: "ar320-normal-light", locale: "ar", theme: "light", width: 320, zoom: "none" },
  { id: "en390-normal-dark", locale: "en", theme: "dark", width: 390, zoom: "none" },
  { id: "ar768-normal-dark", locale: "ar", theme: "dark", width: 768, zoom: "none" },
  { id: "en1440-normal-light", locale: "en", theme: "light", width: 1440, zoom: "none" },
  { id: "en1440-native200-light", locale: "en", theme: "light", width: 1440, zoom: "native" },
] as const;
const selectedCase = process.env.ISSUE314_CASE_ONLY;
const selected = cases.filter((item) => !selectedCase || item.id === selectedCase);
if (selected.length === 0) throw new Error(`Unknown ISSUE314_CASE_ONLY=${selectedCase}`);

type Measurement = Awaited<ReturnType<typeof measure>>;

async function measure(page: Page, requireDrawer = true) {
  return page.evaluate((requiresDrawer) => {
    const rectangle = (element: Element | null) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { left: +r.left.toFixed(2), right: +r.right.toFixed(2), top: +r.top.toFixed(2),
        bottom: +r.bottom.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
    };
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    const byClass = (suffix: string) => Array.from(dialog?.querySelectorAll("div") ?? [])
      .find((element) => typeof element.className === "string" &&
        element.className.split(" ").some((name) => name.includes(`_${suffix}__`) || name.endsWith(`_${suffix}`))) ?? null;
    const header = byClass("drawerHeader");
    const body = byClass("drawerBody") as HTMLElement | null;
    const list = byClass("factList");
    const facts = Array.from(list?.children ?? []).map((node) => {
      const label = node.querySelector("span");
      const value = node.querySelector("strong");
      const span = value ? document.createRange() : null;
      if (value && span) span.selectNodeContents(value);
      const valueText = span ? span.getBoundingClientRect() : null;
      return {
        label: label?.textContent ?? "", value: value?.textContent ?? "",
        row: rectangle(node), labelRect: rectangle(label), valueRect: rectangle(value),
        valueText: valueText ? { left: +valueText.left.toFixed(2), right: +valueText.right.toFixed(2) } : null,
        css: value ? { overflowWrap: getComputedStyle(value).overflowWrap,
          wordBreak: getComputedStyle(value).wordBreak, minWidth: getComputedStyle(value).minWidth } : null,
      };
    });
    if (requiresDrawer && (!dialog || !header || !body || !list || facts.length !== 10 ||
        facts.some((fact) => !fact.label || !fact.valueRect || !fact.row))) {
      throw new Error(`FAIL_CLOSED_GEOMETRY ${JSON.stringify({ dialog: !!dialog, header: !!header,
        body: !!body, list: !!list, count: facts.length })}`);
    }
    const buttons = Array.from(header?.querySelectorAll("button") ?? []).map((button) => ({
      name: button.getAttribute("aria-label"), rect: rectangle(button),
    }));
    const within = (r: { left: number; right: number } | null) => !!r && r.left >= -0.5 && r.right <= innerWidth + 0.5;
    return {
      innerWidth, outerWidth, devicePixelRatio, visualScale: visualViewport?.scale ?? null,
      htmlDir: document.documentElement.dir, lang: document.documentElement.lang,
      theme: document.documentElement.getAttribute("data-theme"),
      cssZoom: getComputedStyle(document.documentElement).zoom,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      fontsReady: document.fonts.status,
      bodyFont: getComputedStyle(document.body).fontFamily,
      drawer: rectangle(dialog), drawerHeader: rectangle(header),
      drawerBody: rectangle(body), factList: rectangle(list),
      bodyScrollWidth: body?.scrollWidth ?? null, bodyClientWidth: body?.clientWidth ?? null,
      bodyScrollHeight: body?.scrollHeight ?? null, bodyClientHeight: body?.clientHeight ?? null,
      bodyScrollTop: body?.scrollTop ?? null,
      buttons, facts,
      horizontal: { buttonsInside: buttons.every((button) => within(button.rect)),
        valuesInside: facts.every((fact) => within(fact.valueRect) && within(fact.valueText)),
        listInside: within(rectangle(list)), bodyInside: within(rectangle(body)),
        bodyNoInternalXScroll: body ? body.scrollWidth <= body.clientWidth + 1 : false },
    };
  }, requireDrawer);
}

test.setTimeout(300_000);
test("#314 W5 matched synthetic Incidents before/after with native and CSS zoom", async () => {
  mkdirSync(extension, { recursive: true });
  mkdirSync(join(output, variant), { recursive: true });
  writeFileSync(join(extension, "manifest.json"), JSON.stringify({
    manifest_version: 3, name: "VAYLET #314 independent native Chrome zoom verification",
    version: "1.0.0", permissions: ["tabs"], background: { service_worker: "background.js" },
  }, null, 2));
  writeFileSync(join(extension, "background.js"), "chrome.runtime.onInstalled.addListener(() => {});\n");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, baseURL: origin, viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1, args: [
      `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,900",
    ],
  });
  const observations: Record<string, unknown> = {};
  try {
    const page = context.pages()[0] ?? await context.newPage();
    const jsErrors: string[] = [];
    page.on("pageerror", (error) => jsErrors.push(error.message));
    await enterR08(page, "/incidents", fixture);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const tabId = await worker.evaluate(async (url) => {
      const tabs = (globalThis as unknown as { chrome: { tabs: {
        query(options: object): Promise<Array<{ id?: number; url?: string }>>;
      } } }).chrome.tabs;
      const match = (await tabs.query({})).find((tab) => tab.url?.startsWith(url));
      if (match?.id === undefined) throw new Error("Native Chrome tab not found");
      return match.id;
    }, origin);
    const zoom = async (factor: number) => worker.evaluate(async ({ id, factor }) => {
      const tabs = (globalThis as unknown as { chrome: { tabs: {
        setZoom(id: number, value: number): Promise<void>;
        getZoom(id: number): Promise<number>;
      } } }).chrome.tabs;
      await tabs.setZoom(id, factor);
      return tabs.getZoom(id);
    }, { id: tabId, factor });

    for (const item of selected) {
      console.log(`[Issue314 ${variant}] START ${item.id}`);
      expect(await zoom(1)).toBe(1);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/incidents");
      await expect(page.getByRole("table")).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.zoom = ""; });
      if (await page.locator("html").getAttribute("dir") === "rtl")
        await page.getByRole("button", { name: "Language" }).click();
      const themeButton = page.getByRole("button", {
        name: item.theme === "dark" ? "Dark" : "Light", exact: true,
      });
      if (await themeButton.getAttribute("aria-pressed") !== "true") await themeButton.click();
      if (item.locale === "ar") await page.getByRole("button", { name: "Language" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", item.locale === "ar" ? "rtl" : "ltr");
      await page.setViewportSize({ width: item.width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const unzoomed = await measure(page, false);
      let nativeZoom: number | null = null;
      if (item.zoom === "native") {
        nativeZoom = await zoom(2);
        expect(nativeZoom).toBe(2);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(item.width * 0.65);
      } else if (item.zoom === "css") {
        await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
      }
      if (item.width === 1440 || item.width === 320) {
        await page.screenshot({ path: join(output, variant, `${item.id}-list.png`), animations: "disabled" });
      }
      const opener = page.locator("tbody tr").first().getByRole("button");
      await opener.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      const close = dialog.getByRole("button", { name: item.locale === "ar" ? "إغلاق" : "Close", exact: true });
      const help = dialog.locator('button[aria-label^="Help:"],button[aria-label^="مساعدة:"]');
      await expect(close).toBeFocused();
      await expect(help).toHaveCount(1);
      await expect(dialog.getByText(item.locale === "ar" ? "أبلغ عنه" : "Reported by", { exact: true })).toHaveCount(1);
      await expect(dialog.getByText(longReporter, { exact: true })).toBeAttached();
      const top = await measure(page);
      await page.screenshot({ path: join(output, variant, `${item.id}-top.png`), animations: "disabled" });
      await page.keyboard.press("Tab");
      const tabToHelp = await help.evaluate((element) => document.activeElement === element);
      await page.keyboard.press("Shift+Tab");
      const shiftTabToClose = await close.evaluate((element) => document.activeElement === element);
      await help.focus();
      await page.keyboard.press("Enter");
      const helpOpened = (await page.getByRole("dialog").count()) === 2;
      if (helpOpened) {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(1);
      }
      const helpRestoresTriggerFocus = await help.evaluate((element) => document.activeElement === element);
      let helpPointerOpened = false;
      if (top.horizontal.buttonsInside) {
        await help.click();
        helpPointerOpened = (await page.getByRole("dialog").count()) === 2;
        if (helpPointerOpened) {
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(1);
        }
      }
      await dialog.evaluate((element) => {
        const body = Array.from(element.querySelectorAll("div")).find((node) =>
          typeof node.className === "string" && node.className.split(" ").some((name) => name.includes("_drawerBody__") || name.endsWith("_drawerBody"))) as HTMLElement | undefined;
        if (body) body.scrollTop = body.scrollHeight;
      });
      const bottom = await measure(page);
      await page.screenshot({ path: join(output, variant, `${item.id}-bottom.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      const escapeClosed = await page.getByRole("dialog").count() === 0;
      const focusReturned = await opener.evaluate((element) => document.activeElement === element);
      let closeClick = false;
      if (item.zoom === "none" || top.horizontal.buttonsInside) {
        await opener.focus();
        await page.keyboard.press("Enter");
        const closeButton = page.getByRole("dialog").getByRole("button", { name: item.locale === "ar" ? "إغلاق" : "Close", exact: true });
        await closeButton.click();
        closeClick = (await page.getByRole("dialog").count()) === 0;
      }
      let fallbackVisible = false;
      if (item.id === "ar320-normal-light" || item.id === "en390-normal-dark") {
        await page.locator("tbody tr").nth(1).getByRole("button").click();
        const fallback = item.locale === "ar" ? "المبلّغ غير متاح" : "Reporter unavailable";
        fallbackVisible = await page.getByRole("dialog").getByText(fallback, { exact: true }).isVisible();
        await page.screenshot({ path: join(output, variant, `${item.id}-null.png`), animations: "disabled" });
        await page.keyboard.press("Escape");
      }
      const result = { item, source: variant, baseURL: origin, browserNativeReportedZoom: nativeZoom,
        unzoomed, top, bottom, interactions: { tabToHelp, shiftTabToClose,
          helpOpened, helpRestoresTriggerFocus, helpPointerOpened, escapeClosed,
          focusReturned, closeClick, fallbackVisible },
        jsErrors: [...jsErrors] };
      observations[item.id] = result;
      writeFileSync(join(output, variant, `${item.id}.json`), JSON.stringify(result, null, 2));
      console.log(`[Issue314 ${variant}] DONE ${item.id} horizontal=${JSON.stringify(top.horizontal)}`);
    }
    writeFileSync(join(output, variant, "manifest.json"), JSON.stringify({
      variant, origin, caseIds: Object.keys(observations), test: "issue314-independent-acceptance.spec.ts",
      zoomMethod: "Chromium MV3 chrome.tabs.setZoom()/getZoom() genuine tab zoom; CSS zoom separate",
      fixture: "synthetic Incident with long Arabic reporter, long bilingual description, UUID IDs, null second row",
      jsErrors,
    }, null, 2));
  } finally {
    await context.close();
  }
});
