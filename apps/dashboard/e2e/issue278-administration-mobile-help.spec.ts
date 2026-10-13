import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { companySettings, managementLocationSettings } from "./support/administration-fixtures";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { legacyLocationKeys, settingDefinitions } from "../src/features/administration/settings/setting-definitions";
import { ordinarySettingHelpKeys } from "../src/features/help/help-setting-manifest";
import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";
import { PresenceFixture } from "./support/presence-fixtures";

const evidence = resolve(process.cwd(), "../../../issue-278-d-evidence/mobile-fix");
const allKeys = settingDefinitions.map(({ key }) => key);
const managerKeys = allKeys.filter((key) => legacyLocationKeys.has(key));
const companyPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/settings`;
const locationPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations/${LOCATION_A.locationId}/settings`;
const managerPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/configuration`;
const variants = [
  { width: 320, locale: "en", dark: false },
  { width: 320, locale: "ar", dark: true },
  { width: 390, locale: "en", dark: true },
  { width: 390, locale: "ar", dark: false },
] as const;
type Scope = "company" | "override" | "manager";

async function enter(page: Page, scope: Scope) {
  const writes: string[] = [];
  const defaults = companySettings().defaults;
  const fixture = new DashboardApiFixture({
    ...(scope === "manager"
      ? { locationManagerOrganizations: [ORG_A],
          locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] } }
      : { companyOrganizations: [ORG_A],
          companyLocations: { [ORG_A.organizationId]: [LOCATION_A] } }),
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) writes.push(path);
      if (path === companyPath && request.method() === "GET") return { body: companySettings() };
      if (path === locationPath && request.method() === "GET") return { body: managementLocationSettings() };
      if (path === managerPath && request.method() === "GET") return {
        body: {
          organizationId: ORG_A.organizationId, locationId: LOCATION_A.locationId,
          timezone: LOCATION_A.timezone, currency: LOCATION_A.currency,
          updatedAt: "2026-09-21T08:00:00.000Z",
          settings: managerKeys.map((key) => {
            const value = defaults[key as keyof typeof defaults];
            return { setting: key, default: value, overridePresent: false,
              override: null, effective: value };
          }),
        },
      };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page, scope === "manager" ? "manager@example.com" : undefined);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: scope === "company" ? "All Locations" : LOCATION_A.name }).click();
  if (scope === "override") await page.getByRole("tab", { name: "Location overrides" }).click();
  return writes;
}

async function presentation(page: Page, locale: "en" | "ar", dark: boolean) {
  await page.getByRole("group", { name: "Theme" }).locator("button").nth(dark ? 1 : 0).click();
  if (locale === "ar") await page.getByRole("button", { name: "Language", exact: true }).click();
}

async function geometry(page: Page, rowSelector: string) {
  const row = page.locator(rowSelector);
  const trigger = row.locator("[data-mobile-setting-help] button");
  await row.scrollIntoViewIfNeeded();
  await row.evaluate((element) => {
    const port = element.closest("table")?.parentElement;
    if (port) port.scrollLeft = 0;
  });
  return trigger.evaluate((button) => {
    const box = (element: Element | null) =>
      element ? element.getBoundingClientRect().toJSON() : null;
    const row = button.closest("tr")!;
    const port = row.closest("table")!.parentElement!;
    const rect = button.getBoundingClientRect();
    const viewport = { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
    const clip = port.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const actions = row.querySelector("td:last-child");
    const buttons = actions?.querySelectorAll("button");
    return {
      label: box(row.querySelector("td:first-child > div:first-child, td:first-child > label:first-child")),
      mobileHelp: rect.toJSON(),
      save: box(buttons?.[0] ?? null),
      actionHelp: box(buttons?.[1] ?? null),
      clear: box(buttons?.[2] ?? null),
      row: box(row),
      columns: Array.from(row.children, (cell) => box(cell)),
      scrollport: { ...clip.toJSON(), width: port.clientWidth,
        scrollWidth: port.scrollWidth, scrollLeft: port.scrollLeft },
      documentScrollWidth: document.documentElement.scrollWidth,
      viewport, visible: getComputedStyle(button).visibility === "visible",
      initiallyVisible: rect.left >= Math.max(viewport.left, clip.left) - 0.5 &&
        rect.right <= Math.min(viewport.right, clip.right) + 0.5 &&
        rect.top >= viewport.top && rect.bottom <= viewport.bottom,
      hit: hit === button || button.contains(hit),
      width: rect.width, height: rect.height,
    };
  });
}

function copyFor(key: ContextHelpKey, locale: "en" | "ar") {
  return contextHelpRegistry[key][locale];
}

for (const scope of ["company", "override", "manager"] as const) {
  for (const variant of variants) {
    test(`U004 ${scope} ${variant.locale} ${variant.dark ? "dark" : "light"} ${variant.width}: every label Help is initially usable`,
      async ({ page }) => {
        test.setTimeout(150_000);
        await page.setViewportSize({ width: variant.width, height: 760 });
        const writes = await enter(page, scope);
        await presentation(page, variant.locale, variant.dark);
        const keys: string[] = scope === "manager" ? [...managerKeys] : [...allKeys];
        if (scope !== "manager") keys.push("operatingHours");
        if (scope === "override") keys.push("slaTargetSeconds");
        await expect(page.locator("tr[data-setting]")).toHaveCount(keys.length);
        const matrix: Record<string, unknown> = {};
        for (const key of keys) {
          const row = page.locator(`tr[data-setting="${key}"]`);
          const trigger = row.locator("[data-mobile-setting-help] button");
          const actionHelp = row.locator("td:last-child").getByRole("button", { name: /^(Help:|مساعدة:)/u });
          await expect(trigger).toBeVisible();
          await expect(actionHelp).toHaveCount(1);
          await expect(trigger).toHaveAttribute("type", "button");
          await expect(trigger).toHaveAttribute("aria-label", await actionHelp.getAttribute("aria-label"));
          const measure = await geometry(page, `tr[data-setting="${key}"]`);
          matrix[key] = measure;
          expect(measure.initiallyVisible, key + " " + JSON.stringify(measure)).toBe(true);
          expect(measure.hit, key).toBe(true);
          expect(measure.documentScrollWidth, key).toBe(variant.width);
          expect(measure.width).toBeGreaterThanOrEqual(24);
          expect(measure.height).toBeGreaterThanOrEqual(24);
          const helpKey = key === "operatingHours" ? "setting.operatingHours"
            : key === "slaTargetSeconds" ? "setting.slaTargetSeconds"
            : ordinarySettingHelpKeys[key as keyof typeof ordinarySettingHelpKeys];
          await trigger.focus();
          await expect(trigger).toBeFocused();
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: copyFor(helpKey, variant.locale).title });
          await expect(dialog).toContainText(copyFor(helpKey, variant.locale).body);
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await expect(trigger).toBeFocused();
        }
        expect(writes).toEqual([]);
        const folder = join(evidence, "after", scope,
          `${variant.locale}-${variant.dark ? "dark" : "light"}-${variant.width}`);
        mkdirSync(folder, { recursive: true });
        await page.screenshot({ path: join(folder, "page.png"), fullPage: true, animations: "disabled" });
        writeFileSync(join(folder, "geometry.json"), JSON.stringify({ scope, variant, rows: matrix }, null, 2));
      });
  }
}

test("desktop 768/1440 hides label duplicates, retains one accessible Actions Help", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const writes = await enter(page, "override");
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 760 });
    for (const key of [...allKeys, "operatingHours", "slaTargetSeconds"]) {
      const row = page.locator(`tr[data-setting="${key}"]`);
      await expect(row.locator("[data-mobile-setting-help]")).toHaveCount(0);
      await expect(row.locator("td:last-child").getByRole("button", { name: /^Help:/ })).toHaveCount(1);
    }
    if (width === 1440) {
      const folder = join(evidence, "after", "desktop-1440");
      mkdirSync(folder, { recursive: true });
      await page.screenshot({ path: join(folder, "page.png"), fullPage: true, animations: "disabled" });
    }
  }
  expect(writes).toEqual([]);
});

test("mobile Help preserves dirty ordinary, seven-day Hours and invalid SLA drafts", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const writes = await enter(page, "override");
  const ordinary = page.locator('tr[data-setting="trackingEnabled"]');
  await ordinary.locator("select").selectOption("false");
  await ordinary.locator("[data-mobile-setting-help] button").click();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(ordinary.locator("select")).toHaveValue("false");
  await expect(ordinary.locator("td:last-child button").first()).toBeEnabled();
  const hours = page.locator('tr[data-setting="operatingHours"]');
  await hours.locator("select").first().selectOption("OPEN");
  await hours.locator('input[type="time"]').first().fill("06:30");
  await hours.locator("[data-mobile-setting-help] button").click();
  await page.keyboard.press("Escape");
  await expect(hours.locator("select").first()).toHaveValue("OPEN");
  await expect(hours.locator('input[type="time"]').first()).toHaveValue("06:30");
  await expect(hours.locator("select")).toHaveCount(7);
  const sla = page.locator('tr[data-setting="slaTargetSeconds"]');
  await sla.locator('input[type="number"]').fill("20");
  await sla.locator("[data-mobile-setting-help] button").click();
  await page.keyboard.press("Escape");
  await expect(sla.locator('input[type="number"]')).toHaveValue("20");
  await expect(sla.locator("td:last-child button").first()).toBeDisabled();
  expect(writes).toEqual([]);
});

test("mobile opening, then Actions Help and resizing while modal open never strands focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const writes = await enter(page, "company");
  const row = page.locator('tr[data-setting="checkInPhotosRequired"]');
  const mobile = row.locator("[data-mobile-setting-help] button");
  await mobile.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 760 });
  await expect(mobile).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const action = row.locator("td:last-child").getByRole("button", { name: /^Help:/ });
  await action.click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(action).toBeFocused();
  expect(writes).toEqual([]);
});

test("real page-scale 200% keeps mobile label Help unobstructed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await enter(page, "override");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale)).toBe(2);
  const measure = await geometry(page, 'tr[data-setting="slaTargetSeconds"]');
  expect(measure.initiallyVisible).toBe(true);
  expect(measure.hit).toBe(true);
  const trigger = page.locator('tr[data-setting="slaTargetSeconds"] [data-mobile-setting-help] button');
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText(copyFor("setting.slaTargetSeconds", "en").body);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  const folder = join(evidence, "after", "zoom-200");
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, "page.png"), fullPage: true, animations: "disabled" });
  writeFileSync(join(folder, "geometry.json"), JSON.stringify({ zoom: 2, row: measure }, null, 2));
  await cdp.detach();
});

test("200% CSS layout zoom keeps the first setting Help in the visible scrollport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  const writes = await enter(page, "company");
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  const row = 'tr[data-setting="checkInPhotosRequired"]';
  const measure = await geometry(page, row);
  expect(measure.initiallyVisible, JSON.stringify(measure)).toBe(true);
  expect(measure.hit).toBe(true);
  const trigger = page.locator(`${row} [data-mobile-setting-help] button`);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText(copyFor("setting.checkInPhotosRequired", "en").body);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(writes).toEqual([]);
});

test("Shift Presence four mobile label Helps retain drafts and zero writes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const f = new PresenceFixture("LM");
  await f.open(page);
  const fields = [
    "shiftStartPresenceMode", "shiftEndPresenceMode",
    "shiftPresenceMaxAccuracyMeters", "shiftPresenceMaxFixAgeSeconds",
  ] as const;
  const fieldGeometry: Record<string, unknown> = {};
  for (const field of fields) {
    const row = page.locator(`tr[data-presence-field="${field}"]`);
    const trigger = row.locator("[data-mobile-setting-help] button");
    await expect(trigger).toBeVisible();
    const measure = await geometry(page, `tr[data-presence-field="${field}"]`);
    fieldGeometry[field] = measure;
    expect(measure.initiallyVisible, field).toBe(true);
    expect(measure.hit, field).toBe(true);
    await trigger.click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
  const row = page.locator('tr[data-presence-field="shiftPresenceMaxAccuracyMeters"]');
  await row.locator("input").fill("70");
  await row.locator("[data-mobile-setting-help] button").click();
  await page.keyboard.press("Escape");
  await expect(row.locator("input")).toHaveValue("70");
  await expect(row.locator("td:last-child button").first()).toBeEnabled();
  expect(f.writes).toEqual([]);
  const folder = join(evidence, "after", "presence-320");
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, "page.png"), fullPage: true, animations: "disabled" });
  writeFileSync(join(folder, "geometry.json"), JSON.stringify(fieldGeometry, null, 2));
});
