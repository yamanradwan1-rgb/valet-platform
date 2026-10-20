import { expect, type Locator, type Page } from "@playwright/test";
import { LOCATION_A, LOCATION_B, ORG_A } from "../e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../e2e/support/foundation-ui";
import { ISSUE304_EXPECTED } from "./issue304-fixture";

export const widths = [320, 390, 768, 1440];
export const languages = ["en", "ar"] as const;
export const themes = ["light", "dark"] as const;
export const kpiNames = [
  "keys-active", "keys-available", "keys-in-use",
  "spots-active", "spots-available", "spots-occupied",
] as const;

export function inspector(page: Page): Locator {
  return page.locator('[data-issue304-inspector], [data-testid="issue304-inspector"]');
}

export function kpi(page: Page, key: typeof kpiNames[number]): Locator {
  return inspector(page).locator(`[data-c-kpi="${key}"], [data-testid="issue304-kpi-${key}"]`);
}

export async function enterInspector(page: Page, role: "CA" | "LM" = "CA") {
  await page.goto("/keys");
  await signInOnCurrentPage(page, role === "LM" ? "manager@example.com" : "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  await expect(inspector(page)).toBeVisible();
}

export async function selectLocation(page: Page, location: "A" | "B") {
  const name = location === "A" ? LOCATION_A.name : LOCATION_B.name;
  const scope = page.locator(".topbar").getByRole("button", { name: "Change scope" });
  await scope.click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.locator(".topbar .location-context")).toContainText(name);
}

export async function setLocale(page: Page, locale: "en" | "ar") {
  const html = page.locator("html");
  if (await html.getAttribute("lang") !== locale)
    await page.getByRole("button", { name: "Language" }).click();
  await expect(html).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  await expect(html).toHaveAttribute("lang", locale);
}

export async function setTheme(page: Page, theme: "light" | "dark") {
  const html = page.locator("html");
  if (await html.getAttribute("data-theme") !== theme) {
    await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light" }).click();
  }
  await expect(html).toHaveAttribute("data-theme", theme);
}

export async function selectFamily(page: Page, family: "keys" | "spots") {
  const name = family === "keys" ? /Key Slots|خانات المفاتيح/u : /Parking Spots|مواقف السيارات/u;
  const button = inspector(page).getByRole("button", { name }).first();
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

export async function expectSixKpis(page: Page, location: "A" | "B") {
  for (const [index, name] of kpiNames.entries()) {
    const card = kpi(page, name);
    await expect(card, `${location} / ${name} must be present in either family`).toBeVisible();
    const number = card.locator('[data-c-kpi-value], [data-testid="issue304-kpi-value"]');
    await expect(number).toHaveText(String(ISSUE304_EXPECTED[location][index]));
  }
}

export function evidenceName(...segments: string[]) {
  return segments.join("-").replace(/[^a-z0-9_-]/giu, "_");
}
