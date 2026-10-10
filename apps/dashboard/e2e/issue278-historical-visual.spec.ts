import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { locationIntelligenceReply } from "./support/md05-intelligence-fixtures";
import { operationsReadReply, sessionItem } from "./support/operations-fixtures";
import { enterManagerReports, loadReport, managerReportsFixture } from "./support/md05-reports-e2e-helpers";

const phase = process.env.ISSUE278_PHASE;
test.skip(phase !== "before" && phase !== "after", "Set ISSUE278_PHASE=before|after");

const routes = [
  "/overview", "/live-operations", "/vehicles", "/tasks", "/maps-zones",
  "/keys", "/incidents", "/payments", "/analytics", "/reports",
] as const;
const variants = [
  { name: "en-light-1440", lang: "en", theme: "Light", width: 1440, height: 900 },
  { name: "ar-dark-390", lang: "ar", theme: "Dark", width: 390, height: 760 },
  { name: "ar-light-1440", lang: "ar", theme: "Light", width: 1440, height: 900 },
  { name: "en-dark-390", lang: "en", theme: "Dark", width: 390, height: 760 },
  { name: "en-light-effective-200pct", lang: "en", theme: "Light", width: 720, height: 900 },
] as const;
const evidenceRoot = resolve(process.cwd(), "../../tmp/issue-278-c-historical-evidence");

async function enter(page: Page, route: string) {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path.endsWith("/overview/live-sessions")) {
        return { body: { items: [{ ...sessionItem(), checkedInBy: null,
          parkedBy: null, parkingCompletionProof: "NO_RECORD" }], nextCursor: null } };
      }
      return operationsReadReply(path) ?? locationIntelligenceReply(path, request);
    },
  });
  await fixture.install(page);
  await page.goto(route);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
}

async function setAppearance(page: Page, variant: (typeof variants)[number]) {
  await page.setViewportSize({ width: variant.width, height: variant.height });
  if (await page.locator("html").getAttribute("lang") === "ar") {
    await page.getByRole("button", { name: "اللغة" }).click();
  }
  await page.getByRole("group", { name: "Theme" }).locator("button")
    .nth(variant.theme === "Dark" ? 1 : 0).click();
  if (variant.lang === "ar") {
    await page.getByRole("button", { name: "Language" }).click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", variant.lang);
  await expect(page.locator("html")).toHaveAttribute("dir", variant.lang === "ar" ? "rtl" : "ltr");
}

async function capture(page: Page, route: string, label: string) {
  const folder = join(evidenceRoot, phase!, route.substring(1), label);
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, "page.png"), fullPage: true, animations: "disabled" });
  const snapshot = await page.evaluate(() => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const main = document.querySelector("main");
    const selectors = [
      "main h1", "main table", "main [class*='metricGrid'] > section",
      "main [class*='summaryGrid'] > section",
      "main [data-testid='analytics-metric-card']",
      "main [class*='period']", "main [class*='toolbar']",
      "main [class*='header']", "main [role='tabpanel']",
      "main [role='dialog']", "main [class*='card']",
    ];
    const elements = Object.fromEntries(selectors.map((selector) =>
      [selector, Array.from(document.querySelectorAll(selector)).slice(0, 8).map(rect)]));
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const helpButtons = Array.from(document.querySelectorAll("main button"))
      .filter((button) => visible(button) && /^(Help:|مساعدة:)/u.test(button.getAttribute("aria-label") ?? ""));
    return {
      route: location.pathname, language: document.documentElement.lang,
      direction: document.documentElement.dir, theme: document.documentElement.getAttribute("data-theme"),
      viewport: { width: innerWidth, height: innerHeight },
      main: main ? rect(main) : null, elements,
      help: helpButtons.map((button) => ({ label: button.getAttribute("aria-label"), ...rect(button) })),
    };
  });
  writeFileSync(join(folder, "geometry.json"), JSON.stringify(snapshot, null, 2), "utf8");
  return folder;
}

for (const route of routes) {
  test(route + " pinned historical visual parity", async ({ page }) => {
    page.setDefaultTimeout(12_000);
    await enter(page, route);
    for (const variant of variants) {
      await setAppearance(page, variant);
      await page.waitForLoadState("networkidle", { timeout: 14_000 });
      await capture(page, route, variant.name);
    }
    await setAppearance(page, variants[0]);
    if (route === "/maps-zones") {
      await page.getByRole("button", { name: "Setup / Operational Areas" }).click();
      await capture(page, route, "en-light-maps-setup");
    }
    if (route === "/keys") {
      await page.getByRole("tab", { name: "Physical Resources" }).click();
      await capture(page, route, "en-light-keys-configuration");
      await page.getByRole("button", { name: "Add Key Slot" }).click();
      await capture(page, route, "en-light-key-slot-dialog");
    }
    if (route === "/live-operations" || route === "/vehicles" ||
        route === "/tasks" || route === "/incidents") {
      await page.getByRole("button", { name: /^Details:/u }).first().click();
      await capture(page, route, "en-light-details-drawer");
    }
  });
}

test("Reports loaded export footer historical dialog geometry", async ({ page }) => {
  const fixture = managerReportsFixture();
  await fixture.install(page);
  await enterManagerReports(page);
  for (const variant of [variants[0], variants[3]]) {
    await setAppearance(page, variant);
    const dialog = await loadReport(page, "DAILY");
    await expect(dialog.getByTestId("report-preview-content")).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 12_000 });
    await capture(page, "/reports", variant.name + "-loaded-export-dialog");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});
