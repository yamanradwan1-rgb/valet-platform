import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { locationIntelligenceReply } from "./support/md05-intelligence-fixtures";
import { operationsReadReply, sessionItem } from "./support/operations-fixtures";

// Synthetic tenant-safe evidence: "help-hidden" is a DOM comparison, not
// a screenshot built from an earlier Git SHA.
const routes = [
  ["/overview", "overview.page"],
  ["/live-operations", "live.page"],
  ["/vehicles", "vehicles.page"],
  ["/tasks", "tasks.page"],
  ["/maps-zones", "maps.page"],
  ["/keys", "keys.page"],
  ["/incidents", "incidents.page"],
  ["/payments", "payments.page"],
  ["/analytics", "analytics.page"],
  ["/reports", "reports.page"],
] as const satisfies readonly (readonly [string, ContextHelpKey])[];

const variants = [
  { name: "EN-light-wide", locale: "en", theme: "Light", width: 1440, height: 900 },
  { name: "AR-dark-narrow", locale: "ar", theme: "Dark", width: 390, height: 760 },
] as const;
const extraVariants = [
  { name: "EN-dark-narrow", locale: "en", theme: "Dark", width: 390, height: 760 },
  { name: "AR-light-wide", locale: "ar", theme: "Light", width: 1440, height: 900 },
] as const;
const hideHelpCss = 'button[aria-label^="Help:"],button[aria-label^="مساعدة:"]{display:none !important}';

async function enter(page: Page, path: string) {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (requestPath, request) => {
      if (requestPath.endsWith("/overview/live-sessions")) {
        return { body: { items: [{ ...sessionItem(), checkedInBy: null,
          parkedBy: null, parkingCompletionProof: "NO_RECORD" }], nextCursor: null } };
      }
      return operationsReadReply(requestPath)
        ?? locationIntelligenceReply(requestPath, request);
    },
  });
  await fixture.install(page);
  await page.goto(path);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

async function capture(
  page: Page,
  info: TestInfo,
  key: ContextHelpKey,
  variant: {
    readonly name: string;
    readonly locale: "en" | "ar";
    readonly theme: "Dark" | "Light";
    readonly width: number;
    readonly height: number;
  },
) {
  await page.setViewportSize({ width: variant.width, height: variant.height });
  const lang = await page.locator("html").getAttribute("lang");
  // Theme's button accessible name is localized; select it in EN first.
  if (lang === "ar") {
    await page.getByRole("button", { name: "اللغة" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  }
  // Compact mobile Theme controls intentionally use icon-only buttons.
  await page.getByRole("group", { name: "Theme" }).locator("button")
    .nth(variant.theme === "Light" ? 0 : 1).click();
  if (variant.locale === "ar") {
    await page.getByRole("button", { name: "Language" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  }
  const copy = contextHelpRegistry[key][variant.locale];
  const helpButton = page.getByRole("button", {
    name: (variant.locale === "ar" ? "مساعدة: " : "Help: ") + copy.title,
    exact: true,
  });
  await expect(helpButton).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 12_000 });
  const hidden = await page.addStyleTag({ content: hideHelpCss });
  await page.screenshot({ path: info.outputPath(variant.name + "-help-hidden.png"), fullPage: true });
  await hidden.evaluate((style) => style.remove());
  await page.screenshot({ path: info.outputPath(variant.name + "-help-mounted.png"), fullPage: true });
  await helpButton.click();
  const dialog = page.getByRole("dialog", { name: copy.title });
  await expect(dialog).toContainText(copy.body);
  await expect(dialog.locator('[lang="' + variant.locale + '"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath(variant.name + "-dialog.png"), fullPage: true });
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(variant.width);
  expect(bounds!.height).toBeLessThanOrEqual(variant.height);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

for (const [route, key] of routes) {
  test(route + " help visual evidence EN/AR Light/Dark wide/narrow", async ({ page }, info) => {
    page.setDefaultTimeout(9_000);
    await enter(page, route);
    for (const variant of variants) await capture(page, info, key, variant);
    if (route === "/overview" || route === "/reports") {
      for (const variant of extraVariants) await capture(page, info, key, variant);
    }
  });
}

for (const [route, testId, selector] of [
  ["/overview", "md05-overview-page", '[class*="metricGrid"] > section'],
  ["/payments", "md05-payments-page", '[class*="summaryGrid"] > section'],
  ["/analytics", "md05-analytics-page", '[data-testid="analytics-metric-card"]'],
] as const) {
  test(route + " first KPI card geometry parity", async ({ page }) => {
    await enter(page, route);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 760 });
      const card = page.getByTestId(testId).locator(selector).first();
      await expect(card).toBeVisible();
      const helpMounted = await card.boundingBox();
      const hidden = await page.addStyleTag({ content: hideHelpCss });
      const helpHidden = await card.boundingBox();
      expect(Math.abs(helpMounted!.height - helpHidden!.height)).toBeLessThanOrEqual(1);
      await hidden.evaluate((element) => element.remove());
    }
  });
}
