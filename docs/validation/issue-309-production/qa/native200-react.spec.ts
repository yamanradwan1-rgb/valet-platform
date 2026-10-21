import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture, E2E_IDS, LOCATION_A, ORG_A,
} from "../../../../apps/dashboard/e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../../../../apps/dashboard/e2e/support/foundation-ui";
import {
  operationsReadReply, OP_IDS, sessionItem,
} from "../../../../apps/dashboard/e2e/support/operations-fixtures";
import { installPhotoScenario } from "./photo-scenario-fixture";

const candidateCommit = process.env.ISSUE309_CANDIDATE_SHA ?? "8dc1c421";
const output = resolve(__dirname, "results/native200-react");
const scratch = resolve(__dirname, "../../../../apps/dashboard/test-results/issue309-native200-react");
const extension = join(scratch, "extension");
// A fresh profile is required for every isolated Playwright run: otherwise
// an earlier genuine-zoom smoke test's signed-in cookie persists and makes
// the next run bypass the fixture's Sign in screen unexpectedly.
const profile = join(scratch, `profile-${process.pid}`);
const origin = process.env.ISSUE309_APP_URL ?? "http://127.0.0.1:3197";
const base = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const item = sessionItem({
  activeTask: {
    taskId: OP_IDS.task,
    assignee: {
      membershipId: E2E_IDS.membership,
      identity: { firstName: "Lina", lastName: "Haddad", email: "lina@example.com" },
    },
  },
  keySlot: { resourceId: OP_IDS.keySlot, code: "K-12", label: null },
  parkingZone: { resourceId: OP_IDS.point, code: "Z-1", label: "Garage" },
  parkingSpot: { resourceId: OP_IDS.area, code: "P-4", label: "North" },
  vehicle: {
    vehicleId: OP_IDS.vehicle, make: "Toyota", model: "Camry", color: "Black",
    plateCountry: "JO", plateNumberNormalized: "12-34567", temporaryDescriptor: null,
  },
});

type Case = {
  name: string;
  surface: "vehicles" | "live-operations";
  locale: "en" | "ar";
  theme: "light" | "dark";
  width: 320 | 390;
};

const cases: Case[] = [];
for (const surface of ["vehicles", "live-operations"] as const) {
  for (const width of [320, 390] as const) {
    for (const locale of ["en", "ar"] as const) {
      for (const theme of ["light", "dark"] as const) {
        cases.push({ name: `${surface}-${locale}-${theme}-${width}-native200`, surface, locale, theme, width });
      }
    }
  }
}
const smokeNames = new Set([
  "vehicles-en-light-320-native200",
  "vehicles-ar-dark-320-native200",
  "live-operations-en-dark-390-native200",
  "live-operations-ar-light-390-native200",
]);
const mode = process.env.ISSUE309_NATIVE_MODE ?? "smoke";
if (mode !== "smoke" && mode !== "all") throw new Error("ISSUE309_NATIVE_MODE must be smoke or all");
const selectedCases = mode === "smoke" ? cases.filter((entry) => smokeNames.has(entry.name)) : cases;

async function geometry(page: Page) {
  return page.evaluate(() => {
    const r = (node: Element | DOMRect | null) => {
      if (!node) return null;
      const b = node instanceof Element ? node.getBoundingClientRect() : node;
      return { x: +b.x.toFixed(2), y: +b.y.toFixed(2),
        width: +b.width.toFixed(2), height: +b.height.toFixed(2),
        left: +b.left.toFixed(2), right: +b.right.toFixed(2),
        top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2) };
    };
    const root = document.documentElement;
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    const header = dialog?.querySelector('[class*="drawerHeader"]') ?? null;
    const help = header?.querySelector('button[aria-label^="Help:"], button[aria-label^="مساعدة:"]') ?? null;
    const close = header?.querySelector('button[aria-label="Close"], button[aria-label="إغلاق"]') ?? null;
    const body = dialog?.querySelector('[class*="drawerBody"]') as HTMLElement | null;
    const list = body?.querySelector('[class*="factList"]') ?? null;
    const row = (n: Element) => {
      const label = n.querySelector("span");
      const value = n.querySelector("strong");
      const range = value ? document.createRange() : null;
      if (range && value) range.selectNodeContents(value);
      return { label: label?.textContent ?? null, value: value?.textContent ?? null,
        row: r(n), labelRect: r(label), valueRect: r(value), valueTextRect: range ? r(range.getBoundingClientRect()) : null };
    };
    const facts = Array.from(list?.children ?? []).map(row);
    const inside = (b: ReturnType<typeof r>) => Boolean(b && b.left >= -0.5 && b.right <= innerWidth + 0.5);
    const nodeInfo = (node: Element | null) => node ? {
      rect: r(node),
      ariaLabel: node.getAttribute("aria-label"), className: node.getAttribute("class"),
      fontFamily: getComputedStyle(node).fontFamily, fontSize: getComputedStyle(node).fontSize,
      fontWeight: getComputedStyle(node).fontWeight,
      color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor,
      svg: node.querySelector("svg")?.outerHTML ?? null,
      focused: document.activeElement === node,
      visibleWithinViewport: inside(r(node)),
    } : null;
    return {
      viewport: { innerWidth, innerHeight, outerWidth, outerHeight,
        dpr: devicePixelRatio, visualScale: visualViewport?.scale ?? null },
      root: { dir: root.dir, lang: root.lang, theme: root.dataset.theme,
        cssZoom: getComputedStyle(root).zoom, inlineZoom: root.style.zoom,
        clientWidth: root.clientWidth, scrollWidth: root.scrollWidth,
        clientHeight: root.clientHeight, scrollHeight: root.scrollHeight },
      body: { rect: r(document.body), font: getComputedStyle(document.body).fontFamily,
        fontSize: getComputedStyle(document.body).fontSize },
      fontFaces: Array.from(document.fonts, (face) => ({ family: face.family, status: face.status })),
      shell: r(document.querySelector(".shell")),
      content: r(document.querySelector(".content")),
      table: r(document.querySelector("table")),
      drawer: r(dialog), header: r(header), bodyPanel: r(body), factList: r(list),
      bodyScroll: body ? { width: body.clientWidth, scrollWidth: body.scrollWidth,
        height: body.clientHeight, scrollHeight: body.scrollHeight, scrollTop: body.scrollTop } : null,
      help: nodeInfo(help), close: nodeInfo(close),
      facts, factCount: facts.length,
      horizontallyInside: { help: inside(r(help)), close: inside(r(close)),
        list: inside(r(list)), values: facts.every((f) => inside(f.valueRect)),
        valueText: facts.every((f) => inside(f.valueTextRect)) },
      photoSectionCount: dialog?.querySelectorAll('[data-photo], [data-testid*="photo"], img').length ?? 0,
      focused: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null,
    };
  });
}

function fixtureFor(page: Page) {
  // Synthetic verified three-photo manifest + protected JPEG bytes: no real
  // S3/MinIO credentials, object keys, account or customer photo data.
  return installPhotoScenario(page, "three").setup();
}

test(`#309 PRODUCTION React SessionPhotos true native Chromium 200% ${mode}`, async () => {
  mkdirSync(output, { recursive: true });
  mkdirSync(extension, { recursive: true });
  writeFileSync(join(extension, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    name: "VAYLET Issue309 candidate React Chrome native 200% measurement",
    version: "1.0.0",
    permissions: ["tabs"],
    background: { service_worker: "background.js" },
  }, null, 2));
  writeFileSync(join(extension, "background.js"), "chrome.runtime.onInstalled.addListener(() => {});\n");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, baseURL: origin,
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--window-size=1440,900"],
  });
  const results: Record<string, unknown> = {};
  const pageErrors: string[] = [];
  try {
    const page = context.pages()[0] ?? await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await fixtureFor(page);
    await page.goto("/vehicles");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await expect(page.getByRole("table").getByText("Toyota Camry", { exact: true })).toBeVisible();
    const worker = context.serviceWorkers()[0] ??
      await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const tabId = await worker.evaluate(async (prefix) => {
      const tabs = await chrome.tabs.query({});
      const match = tabs.find((tab) => tab.url?.startsWith(prefix));
      if (match?.id === undefined) throw new Error("Native Chromium tab not found");
      return match.id;
    }, origin);
    const zoom = async (factor: number) => worker.evaluate(async ({ id, factor }) => {
      await chrome.tabs.setZoom(id, factor);
      return chrome.tabs.getZoom(id);
    }, { id: tabId, factor });

    for (const variant of selectedCases) {
      console.log(`[Issue309 genuine native zoom] START ${variant.name}`);
      expect(await zoom(1)).toBe(1);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/${variant.surface}`);
      await expect(page.getByRole("table").getByText("Toyota Camry", { exact: true })).toBeVisible();
      // Product-owned preferences and their original event signals; no CSS overrides.
      await page.evaluate(({ locale, theme }) => {
        localStorage.setItem("vaylet_dashboard_locale", locale);
        localStorage.setItem("vaylet_dashboard_theme", theme);
        dispatchEvent(new Event("vaylet-dashboard-locale-change"));
        dispatchEvent(new Event("vaylet-dashboard-theme-change"));
      }, variant);
      await expect(page.locator("html")).toHaveAttribute("lang", variant.locale);
      await expect(page.locator("html")).toHaveAttribute("dir", variant.locale === "ar" ? "rtl" : "ltr");
      await expect(page.locator("html")).toHaveAttribute("data-theme", variant.theme);
      await page.setViewportSize({ width: variant.width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const unzoomed = await geometry(page);
      expect(unzoomed.viewport.innerWidth).toBe(variant.width);
      const zoomReported = await zoom(2);
      expect(zoomReported).toBe(2);
      await expect.poll(() => page.evaluate(() => innerWidth), { timeout: 10_000 })
        .toBe(variant.width / 2);
      const closed = await geometry(page);
      expect(closed.viewport.dpr).toBe(2);
      expect(closed.viewport.visualScale).toBe(1);
      expect(closed.root.cssZoom).toBe("1");
      await page.screenshot({ path: join(output, `${variant.name}-closed.png`), animations: "disabled" });
      const trigger = page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u }).first();
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      const close = dialog.getByRole("button", {
        name: variant.locale === "ar" ? "إغلاق" : "Close", exact: true,
      });
      const help = dialog.locator('button[aria-label^="Help:"], button[aria-label^="مساعدة:"]');
      await expect(help).toHaveCount(1);
      await expect(close).toBeFocused();
      await page.evaluate(() => document.fonts.ready);
      const top = await geometry(page);
      expect(top.factCount).toBe(variant.surface === "vehicles" ? 12 : 14);
      await expect(page.locator('[class*="photoSection"]')).toBeVisible();
      await expect(page.locator('[class*="photoSection"] button[class*="photoTile"]')).toHaveCount(3);
      expect(top.photoSectionCount).toBeGreaterThan(0);
      // The browser's actual zoom must not create horizontal overflows in
      // the page or scroll body. The source Close clipping at physical320 is
      // inherited, documented and not misclassified as a photo regression.
      expect(top.root.scrollWidth).toBe(top.root.clientWidth);
      expect(top.bodyScroll?.scrollWidth).toBe(top.bodyScroll?.width);
      await page.screenshot({ path: join(output, `${variant.name}-drawer-top.png`), animations: "disabled" });
      await page.keyboard.press("Tab");
      const tabToHelp = await help.evaluate((element) => document.activeElement === element);
      await page.keyboard.press("Shift+Tab");
      const shiftTabToClose = await close.evaluate((element) => document.activeElement === element);
      await dialog.locator('[class*="drawerBody"]').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const bottom = await geometry(page);
      await page.screenshot({ path: join(output, `${variant.name}-drawer-bottom.png`), animations: "disabled" });
      const firstTile = page.locator('[class*="photoSection"] button[class*="photoTile"]').first();
      await firstTile.scrollIntoViewIfNeeded();
      await firstTile.focus();
      await page.keyboard.press("Enter");
      const viewer = page.locator('[class*="viewerBackdrop"] [role="dialog"]');
      await expect(viewer).toBeVisible();
      await expect(viewer).toHaveAttribute("aria-modal", "true");
      await page.screenshot({ path: join(output, `${variant.name}-viewer.png`), animations: "disabled" });
      const viewerBounds = await viewer.boundingBox();
      await page.keyboard.press("Escape");
      await expect(viewer).toHaveCount(0);
      const thumbnailFocusReturned = await firstTile.evaluate((element) => document.activeElement === element);
      expect(thumbnailFocusReturned).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      const escapeClosed = await page.getByRole("dialog").count() === 0;
      const focusReturned = await trigger.evaluate((element) => document.activeElement === element);
      const observation = {
        case: variant, candidateCommit, zoomMethod: "MV3 chrome.tabs.setZoom(tabId,2) and getZoom===2",
        zoomReported, unzoomed, closed, top, bottom,
        viewerBounds,
        accessibility: { initialCloseFocus: top.close?.focused ?? false,
          helpAriaLabel: top.help?.ariaLabel, closeAriaLabel: top.close?.ariaLabel,
          tabToHelp, shiftTabToClose, escapeClosed, focusReturned, thumbnailFocusReturned },
        errorsAtCapture: [...pageErrors],
      };
      results[variant.name] = observation;
      writeFileSync(join(output, `${variant.name}.json`), JSON.stringify(observation, null, 2));
      console.log(`[Issue309 genuine native zoom] PASS ${variant.name} effectiveWidth=${top.viewport.innerWidth} helpVisible=${top.horizontallyInside.help} closeVisible=${top.horizontallyInside.close}`);
    }
    expect(pageErrors).toEqual([]);
    writeFileSync(join(output, `manifest-${mode}.json`), JSON.stringify({
        candidate: candidateCommit, cases: Object.keys(results),
      zoomMethod: "Chromium MV3 chrome.tabs.setZoom(2), verified getZoom 2; no CSS zoom or pinch",
      fixture: "synthetic signed-in Company and Location, no private vehicle photos",
      browserErrors: pageErrors, allCases: cases.map((c) => c.name),
    }, null, 2));
  } finally {
    await context.close();
  }
});
