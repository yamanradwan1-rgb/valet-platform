import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { mockOperationsGoogleMap } from "./support/operations-google-map-mock";
import {
  areaItem,
  liveMapBody,
  pointItem,
} from "./support/operations-fixtures";

const output = join(tmpdir(), "vaylet-live-google-map-visual");
const baseline = process.env.LIVE_GOOGLE_MAP_VISUAL_BASELINE === "true";
const compare = process.env.LIVE_GOOGLE_MAP_VISUAL_COMPARE === "true";
const configured = Boolean(
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() &&
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim(),
);
const livePath = `/v1/staff/locations/${LOCATION_A.locationId}/live-operations-map`;
const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

const cases = [
  ["en", "light", 1440],
  ["en", "dark", 1440],
  ["ar", "light", 1440],
  ["ar", "dark", 1440],
  ["en", "light", 480],
  ["ar", "dark", 480],
] as const;

type FrozenSnapshot = {
  readonly name: string;
  readonly geometry: readonly number[];
  readonly style: readonly string[];
};

async function frozen(name: string, locator: Locator): Promise<FrozenSnapshot> {
  const value = await locator.evaluate((node) => {
    const element = node as HTMLElement;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const tenth = (value: number) => Math.round(value * 10) / 10;
    return {
      geometry: [rect.x, rect.y, rect.width, rect.height].map(tenth),
      style: [
        style.display,
        style.position,
        style.fontFamily,
        style.fontSize,
        style.fontWeight,
        style.lineHeight,
        style.color,
        style.backgroundColor,
        style.borderRadius,
        style.padding,
        style.margin,
        style.gap,
        style.gridTemplateColumns,
        style.flexDirection,
        style.alignItems,
        style.justifyContent,
      ],
    };
  });
  return { name, ...value };
}

async function liveFrozen(page: Page, locale: "en" | "ar") {
  const toolbar = page.getByTestId("map-reference-toolbar");
  const surface = page.getByRole("region", {
    name: locale === "ar" ? "خريطة الإحداثيات التشغيلية" : "Operational coordinate map",
  });
  const panel = page.getByRole("complementary", {
    name: locale === "ar" ? "العمليات المباشرة" : "Live Operations",
  });
  return Promise.all([
    frozen("sidebar", page.locator(".sidebar")),
    frozen("topbar", page.locator(".topbar")),
    frozen("page", page.getByTestId("md03-page")),
    frozen("title", page.getByRole("heading", {
      name: locale === "ar" ? "الخرائط والمناطق" : "Maps & Zones",
      level: 1,
    })),
    frozen("subtitle", page.getByText(
      locale === "ar"
        ? "مواقع المهام المباشرة وإعداد الخريطة المصرح."
        : "Live task positions and authorized map setup.",
      { exact: true },
    )),
    frozen("toolbar", toolbar),
    frozen("scope", toolbar.locator('[class*="scopeControl"]')),
    frozen("levels", toolbar.locator('[class*="levelControl"]')),
    frozen("modes", toolbar.locator('[class*="modeGroup"]')),
    frozen("refresh", toolbar.getByRole("button", {
      name: locale === "ar" ? "تحديث" : "Refresh",
    })),
    frozen("grid", page.getByTestId("map-reference-grid")),
    frozen("surface", surface),
    frozen("surface-header", surface.locator(":scope > div").first()),
    frozen("surface-status", surface.locator('[class*="statusRow"]')),
    frozen("surface-meta", surface.locator('[class*="surfaceMeta"]')),
    frozen("legend", surface.locator(":scope > div").last()),
    frozen("live-panel", panel),
  ]);
}

async function setupFrozen(page: Page, locale: "en" | "ar") {
  const setup = page.getByRole("region", {
    name: locale === "ar" ? "إعداد الخريطة" : "Map setup",
  });
  const addPoint = setup.getByRole("button", {
    name: locale === "ar" ? "إضافة نقطة" : "Add Point",
  });
  await addPoint.click();
  const dialog = page.getByRole("dialog", {
    name: locale === "ar" ? "إضافة نقطة" : "Add Point",
  });
  await expect(dialog).toBeVisible();
  const result = await Promise.all([
    frozen("setup-panel", setup),
    frozen("setup-add-point", addPoint),
    frozen("point-dialog", dialog),
    frozen("point-dialog-header", dialog.locator("header")),
    frozen("point-dialog-body", dialog.locator('[class*="mapDialogBody"]')),
    frozen("point-dialog-footer", dialog.locator("footer")),
  ]);
  await page.keyboard.press("Escape");
  return result;
}

async function openMaps(page: Page) {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === livePath) return { body: liveMapBody() };
      if (path === pointsPath) return { body: { points: [pointItem()] } };
      if (path === areasPath) return { body: { areas: [areaItem()] } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

for (const [locale, theme, width] of cases) {
  test(`Maps freeze ${locale}/${theme}/${width}`, async ({ page }) => {
    test.skip(!baseline && !compare, "Run through the explicit live Google map visual freeze gate.");
    await page.setViewportSize({ width, height: 900 });
    if (!baseline && configured) await mockOperationsGoogleMap(page);
    await openMaps(page);
    await page.evaluate(
      ({ nextLocale, nextTheme }) => {
        localStorage.setItem("vaylet_dashboard_locale", nextLocale);
        localStorage.setItem("vaylet_dashboard_theme", nextTheme);
        window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
        window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
      },
      { nextLocale: locale, nextTheme: theme },
    );
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.evaluate(async () => document.fonts.ready);

    const live = await liveFrozen(page, locale);
    const setupButton = page.getByRole("button", {
      name: locale === "ar" ? "الإعداد / المناطق التشغيلية" : "Setup / Operational Areas",
    });
    await setupButton.click();
    const setup = await setupFrozen(page, locale);
    const snapshot = [...live, ...setup];
    const name = `${locale}-${theme}-${width}`;
    mkdirSync(output, { recursive: true });

    if (baseline) {
      writeFileSync(join(output, `${name}-baseline.json`), JSON.stringify(snapshot));
    } else {
      const expected = JSON.parse(
        readFileSync(join(output, `${name}-baseline.json`), "utf8"),
      );
      expect(snapshot).toEqual(expected);
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: join(output, `${name}-${baseline ? "baseline" : "candidate"}.png`),
      fullPage: true,
    });
  });
}
