import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  initialPhotoCount,
  installPhotoScenario,
  openPhotos,
  photoScenarios,
  type PhotoScenario,
} from "./photo-scenario-fixture";

const output = resolve(__dirname, "results/photo-matrix");
const widths = [320, 390, 768, 1440];

const states = {
  empty: { en: "No verified check-in photos", ar: "لا توجد صور استلام موثّقة" },
  legacy: { en: "No verified check-in photos", ar: "لا توجد صور استلام موثّقة" },
  unavailable: { en: "Photos currently unavailable", ar: "الصور غير متاحة حالياً" },
  loading: { en: "Loading condition photos", ar: "جارٍ تحميل صور السيارة" },
  network: { en: "Photos could not be loaded", ar: "تعذّر تحميل الصور" },
  denied: { en: "Photo access unavailable", ar: "الوصول للصور غير متاح" },
};

type Locale = "en" | "ar";
type Theme = "light" | "dark";

async function photoMetrics(page: Page) {
  return page.locator('[class*="photoSection"]').evaluate((section) => {
    const rect = (element: Element | null) => {
      const b = element?.getBoundingClientRect();
      return b ? { x: +b.x.toFixed(2), y: +b.y.toFixed(2), width: +b.width.toFixed(2),
        height: +b.height.toFixed(2), right: +b.right.toFixed(2), bottom: +b.bottom.toFixed(2) } : null;
    };
    const get = (selector: string) => section.querySelector(selector);
    const drawer = section.closest('[role="dialog"][aria-modal="true"]');
    const body = section.parentElement as HTMLElement;
    const facts = body?.children.item(0);
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      locale: document.documentElement.lang,
      direction: document.documentElement.dir,
      theme: document.documentElement.dataset.theme,
      section: rect(section),
      heading: rect(get("h3")),
      hint: rect(get("p")),
      grid: rect(get('[class*="photoGrid"]')),
      message: rect(get('[class*="photoMessage"]')),
      thumbnails: Array.from(section.querySelectorAll('button[class*="photoTile"]'), rect),
      factList: rect(facts),
      factListEndBeforeSection: facts?.nextElementSibling === section,
      drawer: rect(drawer),
      bodyScrollHeight: body?.scrollHeight,
      bodyClientHeight: body?.clientHeight,
      bodyScrollTop: body?.scrollTop,
      photoTitle: get("h3")?.textContent?.trim(),
      photoCount: get('[class*="photoCount"]')?.textContent?.trim(),
      renderedBlobImages: Array.from(section.querySelectorAll('img[src^="blob:"]')).length,
      linkedStorageKeys: Array.from(section.querySelectorAll('a[href],img[src]')).some((el) =>
        /amazonaws|s3\.|r2\.cloudflarestorage|storage-key|object-key/i.test(el.getAttribute("href") || el.getAttribute("src") || "")),
    };
  });
}

async function checkState(page: Page, scenario: PhotoScenario, locale: Locale) {
  const section = page.locator('[class*="photoSection"]');
  await expect(section).toBeVisible();
  const count = initialPhotoCount(scenario);
  if (count > 0) {
    await expect(section.locator('button[class*="photoTile"]')).toHaveCount(count);
    await expect(section.locator('img[src^="blob:"]')).toHaveCount(count);
    expect(await section.locator('img[src^="blob:"]').evaluateAll((images) =>
      images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
    ), "all protected synthetic JPEGs must decode").toBe(true);
  } else {
    await expect(section.locator('button[class*="photoTile"]')).toHaveCount(0);
    await expect(section.getByText(states[scenario as keyof typeof states]?.[locale] ?? "")).toBeVisible();
  }
  await expect(section.getByRole("heading", { level: 3 })).toHaveText(
    locale === "ar" ? "صور حالة السيارة عند الاستلام" : "Check-in condition photos",
  );
}

async function verifyViewer(page: Page, scenario: PhotoScenario, locale: Locale, key: string) {
  if (scenario !== "viewer") return;
  const firstTile = page.locator('[class*="photoSection"] button[class*="photoTile"]').first();
  await firstTile.focus();
  await page.keyboard.press("Enter");
  const viewer = page.locator('[class*="viewerBackdrop"] [role="dialog"]');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute("aria-modal", "true");
  const close = viewer.getByRole("button", { name: locale === "ar" ? "إغلاق" : "Close" });
  await expect(close).toBeFocused();
  await page.screenshot({ path: resolve(output, `${key}-viewer.png`), animations: "disabled" });
  const initialCount = viewer.locator('[class*="viewerCount"]');
  await expect(initialCount).toContainText("1");
  await page.keyboard.press("ArrowRight");
  await expect(initialCount).toContainText(locale === "ar" ? "3" : "2");
  await page.keyboard.press("ArrowLeft");
  await expect(initialCount).toContainText("1");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(firstTile).toBeFocused();
}

test.beforeAll(() => mkdirSync(output, { recursive: true }));

for (const surface of ["vehicles", "live-operations"] as const) {
  for (const scenario of photoScenarios) {
    test(`${surface}: photo scenario ${scenario} EN/AR Light/Dark 320/390/768/1440`, async ({ page }) => {
      const errors: string[] = [];
      const metrics: { key: string; state: Awaited<ReturnType<typeof photoMetrics>> }[] = [];
      const { setup, releaseLoading, permitNetworkRetry } = installPhotoScenario(page, scenario);
      page.on("pageerror", (error) => errors.push(error.message));
      await setup();
      try {
        await openPhotos(page, surface);
        for (const state of [
          { locale: "en", theme: "light", transition: "none" },
          { locale: "en", theme: "dark", transition: "dark" },
          { locale: "ar", theme: "dark", transition: "language" },
          { locale: "ar", theme: "light", transition: "light" },
        ] as const) {
          if (state.transition !== "none") {
            // Shell preference buttons are intentionally inert behind the
            // modal backdrop. Close the drawer before changing preferences,
            // then reopen the SAME selected session for the next state.
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).toHaveCount(0);
            if (state.transition === "dark") await page.getByRole("button", { name: "Dark" }).click();
            if (state.transition === "language") await page.getByRole("button", { name: "Language" }).click();
            if (state.transition === "light") await page.getByRole("button", { name: "فاتح" }).click();
            await page.getByRole("table").getByRole("button", { name: /Details|التفاصيل/u }).first().click();
            await expect(page.getByRole("dialog")).toBeVisible();
          }
          for (const width of widths) {
            const key = `${surface}-${scenario}-${state.locale}-${state.theme}-${width}`;
            await page.setViewportSize({ width, height: 900 });
            await checkState(page, scenario, state.locale);
            const section = page.locator('[class*="photoSection"]');
            await section.scrollIntoViewIfNeeded();
            const stateMetrics = await photoMetrics(page);
            expect(stateMetrics.factListEndBeforeSection, "photo section must follow original complete FactList").toBe(true);
            expect(stateMetrics.linkedStorageKeys, "no direct storage URLs/object keys").toBe(false);
            expect(stateMetrics.locale).toBe(state.locale);
            expect(stateMetrics.theme).toBe(state.theme);
            expect(stateMetrics.direction).toBe(state.locale === "ar" ? "rtl" : "ltr");
            metrics.push({ key, state: stateMetrics });
            await page.screenshot({ path: resolve(output, `${key}.png`), animations: "disabled" });
            await verifyViewer(page, scenario, state.locale, key);
          }
        }
        if (scenario === "network") {
          permitNetworkRetry();
          await page.locator('[class*="photoSection"]').getByRole("button", { name: /Retry|إعادة المحاولة/u }).click();
          await expect(page.locator('[class*="photoSection"] button[class*="photoTile"]')).toHaveCount(1);
        }
        if (scenario === "ten") {
          const last = page.locator('[class*="photoSection"] button[class*="photoTile"]').nth(9);
          await last.click();
          await expect(page.locator('[class*="viewerBackdrop"] [role="dialog"]')).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(last).toBeFocused();
        }
        expect(metrics).toHaveLength(16);
        expect(errors).toEqual([]);
        writeFileSync(resolve(output, `${surface}-${scenario}-metrics.json`), JSON.stringify({
          surface, scenario, fixture: "synthetic local JPEG; protected mock staff endpoints",
          candidate: process.env.ISSUE309_CANDIDATE_SHA ?? "unrecorded",
          cases: metrics, browserErrors: errors,
        }, null, 2));
      } finally {
        releaseLoading();
      }
    });
  }
}
