import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;
const evidence = fileURLToPath(new URL("../evidence/full-coverage-qa/", import.meta.url));
const baseline = JSON.parse(readFileSync(fileURLToPath(new URL("../evidence/baseline/geometry.json", import.meta.url)), "utf8"));
const options = ["a", "b", "c", "d"] as const;
const navSelector = ".issue321-a-link, .p321-b-link, .p321-c-nav-button, .issue321-option-d__nav-button";
type Result = { variant: string; case: string; status: "PASS" | "FAIL"; error?: string };
const visit = (option: string, section = "presence", scenario = "company-with-location", lang = "en", theme = "light") =>
  `/${option}?section=${section}&scenario=${scenario}&lang=${lang}&theme=${theme}`;
const record = async (results: Result[], variant: string, name: string, action: () => Promise<void>) => {
  try {
    await action();
    results.push({ variant, case: name, status: "PASS" });
  } catch (error) {
    results.push({ variant, case: name, status: "FAIL", error: String(error).slice(0, 1300) });
  }
};
const save = (file: string, payload: object) => {
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, file), JSON.stringify(payload, null, 2));
};
const assertClean = (results: Result[]) => {
  const failures = results.filter(result => result.status === "FAIL");
  expect(failures, JSON.stringify(failures, null, 2)).toHaveLength(0);
};

test("full 4 × 2 × 2 × 4 × 3 visual-state geometry matrix", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(evidence, { recursive: true });
  const samples: object[] = [];
  const failures: Result[] = [];
  const nonLocalRequests = new Set<string>();
  page.on("request", request => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) nonLocalRequests.add(url.origin);
  });
  for (const variant of options) for (const lang of ["en", "ar"]) for (const theme of ["light", "dark"]) {
    for (const width of [320, 390, 768, 1440]) {
      await record(failures, variant, `${lang}/${theme}/${width} matrix`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(visit(variant, "presence", "company-with-location", lang, theme));
        await expect(page.locator('[data-testid="shift-presence-map-first-layout"]')).toBeVisible();
        await expect(page.locator(".p321-geo-canvas").first()).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        for (const zoom of [1, 1.6, 2]) {
          await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
          await page.evaluate(() => document.fonts.ready);
          const geometry = await page.evaluate((navQuery: string) => {
            const rect = (selector: string) => {
              const element = document.querySelector<HTMLElement>(selector);
              if (!element) return null;
              const box = element.getBoundingClientRect();
              return { x: Math.round(box.x), y: Math.round(box.y),
                w: Math.round(box.width), h: Math.round(box.height) };
            };
            return {
              documentWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              pane: rect(".p321-pane"),
              map: rect(".p321-geo-canvas"),
              shell: rect(".shell"),
              sidebar: rect(".sidebar"),
              topbar: rect(".topbar"),
              sectionNav: rect(navQuery),
              presenceNav: rect('[data-testid="presence-view-zones"]'),
              mapKind: document.querySelector(".p321-google-preview") ? "google-enabled" : "offline-coordinate-grid",
              liveGoogleStatus: document.querySelector(".p321-google-preview")?.getAttribute("data-status") ?? null,
              mapCount: document.querySelectorAll(".p321-geo-canvas").length,
              headingCount: document.querySelectorAll("#p321-current-section").length,
            };
          }, navSelector);
          const original = zoom === 1 ? baseline.cases.find((entry: { id: string }) =>
            entry.id === `${width}-${lang}-${theme}-zoom100`) : undefined;
          const shellMismatch: string[] = [];
          for (const key of ["shell", "sidebar", "topbar"] as const) {
            const expected = original?.nodes?.[`.${key}`]?.rect;
            const observed = geometry[key];
            if (!original) continue;
            if (!expected || !observed) shellMismatch.push(`${key}:missing`);
            else for (const [source, target] of [["x", "x"], ["y", "y"], ["width", "w"], ["height", "h"]] as const) {
              if (Math.abs(expected[source] - observed[target]) > 1) {
                shellMismatch.push(`${key}.${source}:expected=${expected[source]},actual=${observed[target]}`);
              }
            }
          }
          samples.push({ variant, lang, theme, width, zoom, ...geometry,
            shellMismatch, hasBaseline: !!original });
          expect(geometry.map?.w).toBeGreaterThan(0);
          expect(geometry.map?.h).toBeGreaterThan(0);
          expect(geometry.headingCount).toBe(1);
          expect(shellMismatch, "Source Dashboard shell changed its DOM geometry").toHaveLength(0);
          if (zoom === 1 ||
            (width === 320 && lang === "ar" && theme === "dark" && zoom === 2) ||
            (width === 390 && lang === "en" && theme === "light" && zoom === 1.6)) {
            await page.screenshot({ path: join(evidence, `${variant}-${width}-${lang}-${theme}-z${Math.round(zoom * 100)}.png`),
              animations: "disabled" });
          }
        }
      });
    }
  }
  save("matrix-results.json", { cases: samples, count: samples.length, expected: 192, failedGroups: failures.filter(v => v.status === "FAIL"),
    nonLocalRequests: [...nonLocalRequests], note: "CSS zoom emulates 160%/200% layout; no real browser zoom was changed." });
  expect(samples).toHaveLength(192);
  expect(nonLocalRequests.size, "Preview requested remote resources").toBe(0);
  assertClean(failures);
});

test("every variant supports map zones, geolocation error, editing, state and dirty guards", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(evidence, { recursive: true });
  const results: Result[] = [];
  const apiRequests: string[] = [];
  page.on("request", request => {
    if (/\/(?:api|graphql|trpc)\b|maps\.googleapis\.com|googleapis\.com\/maps/i.test(request.url())) {
      apiRequests.push(request.url());
    }
  });
  for (const variant of options) {
    await record(results, variant, "map and zone CRUD / geolocation", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(visit(variant));
      await page.getByTestId("presence-view-zones").click();
      await expect(page.locator(".p321-geo-canvas")).toBeVisible();
      const add = page.getByRole("button", { name: "Add zone" });
      await add.click();
      const dialog = page.getByRole("dialog", { name: "Add Attendance Zone" });
      await expect(dialog).toBeVisible();
      await page.evaluate(() => Object.defineProperty(navigator, "geolocation", {
        configurable: true, value: { getCurrentPosition: (_success: unknown, fail: (err: object) => void) =>
          fail({ code: 1, message: "QA synthetic denial" }) },
      }));
      await dialog.getByRole("button", { name: "Use My Current Location" }).click();
      await expect(dialog.getByRole("status")).toContainText("permission denied");
      await page.evaluate(() => Object.defineProperty(navigator, "geolocation", {
        configurable: true, value: { getCurrentPosition: (success: (value: object) => void) =>
          success({ coords: { latitude: 32.556677, longitude: 35.123456, accuracy: 8 } }) },
      }));
      await dialog.getByRole("button", { name: "Use My Current Location" }).click();
      await expect(dialog.getByRole("textbox", { name: "Latitude", exact: true })).toHaveValue("32.556677");
      await expect(dialog.getByRole("textbox", { name: "Longitude", exact: true })).toHaveValue("35.123456");
      await dialog.locator(".p321-geo-canvas").click({ position: { x: 120, y: 100 } });
      await expect(dialog.getByRole("textbox", { name: "Latitude", exact: true })).not.toHaveValue("32.556677");
      await dialog.getByLabel("Label").fill("Main Gate");
      await dialog.getByLabel("Code").fill("MAIN_GATE");
      await dialog.getByLabel("Radius (meters)").fill("125");
      await dialog.getByRole("button", { name: "Save Simulation" }).click();
      await expect(dialog).not.toBeVisible();
      const row = page.locator(".p321-zones-table tbody tr").filter({ hasText: "MAIN_GATE" });
      await expect(row).toBeVisible();
      await expect(row).toContainText("125 m");
      await expect(row).toContainText("1");
      await row.getByRole("button", { name: "Edit" }).click();
      const edit = page.getByRole("dialog", { name: "Edit Attendance Zone" });
      await edit.getByLabel("Radius (meters)").fill("175");
      await edit.getByRole("button", { name: "Save Simulation" }).click();
      await expect(row).toContainText("175 m");
      page.once("dialog", confirmation => confirmation.accept());
      await row.getByRole("button", { name: "Disable" }).click();
      await expect(row).toContainText("Disabled");
      page.once("dialog", confirmation => confirmation.accept());
      await row.getByRole("button", { name: "Enable" }).click();
      await expect(row).toContainText("Active");
      await add.click();
      const duplicate = page.getByRole("dialog", { name: "Add Attendance Zone" });
      await duplicate.getByLabel("Label").fill("Duplicate");
      await duplicate.getByLabel("Code").fill("main_gate");
      await duplicate.getByRole("textbox", { name: "Latitude", exact: true }).fill("32.1");
      await duplicate.getByRole("textbox", { name: "Longitude", exact: true }).fill("35.1");
      await expect(duplicate.getByRole("button", { name: "Save Simulation" })).toBeDisabled();
      page.once("dialog", confirmation => confirmation.accept());
      await duplicate.getByRole("button", { name: "Cancel" }).click();
      await expect(duplicate).not.toBeVisible();
      await expect(add).toBeFocused();
      await page.screenshot({ path: join(evidence, `${variant}-saved-zone.png`), animations: "disabled" });
    });
    await record(results, variant, "unsaved zone dismissal / Escape", async () => {
      await page.goto(visit(variant));
      await page.getByRole("button", { name: "Add zone" }).click();
      const dialog = page.getByRole("dialog", { name: "Add Attendance Zone" });
      await dialog.getByLabel("Label").fill("Unsaved Zone");
      page.once("dialog", confirmation => confirmation.dismiss());
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      page.once("dialog", confirmation => confirmation.accept());
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    });
  }
  save("zone-interactions.json", { results, apiRequests });
  expect(apiRequests, "No API or Google Maps network calls were authorized for the mock QA").toHaveLength(0);
  assertClean(results);
});

test("all variants preserve roles, history, draft protection, Arabic and focus", async ({ page }) => {
  test.setTimeout(300_000);
  const results: Result[] = [];
  for (const variant of options) {
    await record(results, variant, "keyboard navigation, history and drafts", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(visit(variant, "company"));
      const field = page.locator('[id="field-company:checkInPhotosRequired"]');
      const location = page.locator(navSelector).filter({ hasText: "Location Overrides" }).first();
      await field.selectOption("true");
      page.once("dialog", confirmation => confirmation.dismiss());
      await location.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/section=company/);
      await expect(field).toHaveValue("true");
      page.once("dialog", confirmation => confirmation.accept());
      await location.click();
      await expect(page).toHaveURL(/section=location/);
      await page.goBack();
      await expect(page.locator("#p321-current-section")).toContainText("Company Defaults");
      await page.goForward();
      await expect(page.locator("#p321-current-section")).toContainText("Location Overrides");
    });
    await record(results, variant, "role matrix and locale/theme", async () => {
      await page.goto(visit(variant, "location", "location-manager", "ar", "dark"));
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const nav = await page.locator(navSelector).allTextContents();
      expect(nav.join("|")).toContain("حضور الورديات");
      expect(nav.join("|")).not.toContain("إعدادات الشركة الافتراضية");
      expect(nav.join("|")).not.toContain("حالة الخدمات");
      await expect(page.locator(".p321-setting-row")).toHaveCount(10);
      await page.goto(visit(variant, "presence", "location-manager"));
      await expect(page.getByRole("button", { name: "Add zone" })).toBeVisible();
      await page.goto(visit(variant, "presence", "company-no-location"));
      await expect(page.getByRole("button", { name: "Add zone" })).toHaveCount(0);
      await page.goto(visit(variant, "location", "company-no-location"));
      await expect(page.locator(".p321-empty")).toBeVisible();
      await expect(page.locator(".p321-setting-row")).toHaveCount(0);
      await page.goto(visit(variant, "company", "denied"));
      await expect(page.locator(navSelector)).toHaveCount(0);
      await expect(page.locator(".p321-setting-row")).toHaveCount(0);
      await page.goto(visit(variant, "company"));
      await expect(page.locator(".p321-hours-full")).toBeVisible();
      await expect(page.locator(".p321-wa")).toBeVisible();
      await page.goto(visit(variant, "location"));
      await expect(page.locator(".p321-sla-full")).toBeVisible();
      await page.goto(visit(variant, "services"));
      if (variant === "d") {
        await expect(page).toHaveURL(/section=company/);
        await expect(page.locator(".p321-services-full")).toHaveCount(0);
      } else {
        await expect(page.locator(".p321-services-full")).toBeVisible();
      }
    });
    await record(results, variant, "Shift Presence subviews and Help focus", async () => {
      await page.goto(visit(variant));
      for (const subview of ["zones", "policy", "exceptions", "setup", "overview"]) {
        await page.getByTestId(`presence-view-${subview}`).click();
        await expect(page.getByTestId("shift-presence-map-first-layout")).toHaveAttribute("data-active-view", subview);
      }
      const help = page.getByRole("button", { name: /Help: / }).first();
      await help.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(help).toBeFocused();
    });
    await record(results, variant, "presence scope, strict confirmation, exceptions and guided setup", async () => {
      await page.goto(visit(variant));
      await page.getByTestId("presence-view-policy").click();
      const scope = page.getByRole("group", { name: "Policy scope" });
      await scope.getByRole("button", { name: "Company defaults" }).click();
      await expect(scope.getByRole("button", { name: "Company defaults" })).toHaveAttribute("aria-pressed", "true");
      await scope.getByRole("button", { name: "Location overrides" }).click();
      const start = page.locator('[id="p321-presence:location:shiftStartPresenceMode"]');
      await start.selectOption("REQUIRE");
      const row = page.locator(".p321-setting-row").filter({ has: start });
      const saveButton = row.getByRole("button", { name: "Save", exact: true });
      page.once("dialog", confirmation => confirmation.dismiss());
      await saveButton.click();
      await expect(saveButton).toBeEnabled();
      page.once("dialog", confirmation => confirmation.accept());
      await saveButton.click();
      await expect(saveButton).toBeDisabled();
      await page.getByTestId("presence-view-exceptions").click();
      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(page.getByText("No synthetic request history")).toBeVisible();
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(page.getByText(/Local preview refreshed/)).toBeVisible();
      await page.getByTestId("presence-view-setup").click();
      const next = page.getByRole("button", { name: "Next", exact: true });
      await next.click();
      await next.click();
      await next.click();
      await expect(page.getByText("Review simulated saved state")).toBeVisible();
      await expect(next).toBeDisabled();
    });
  }
  save("navigation-results.json", { results });
  assertClean(results);
});
