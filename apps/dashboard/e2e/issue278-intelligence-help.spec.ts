import { expect, test, type Page } from "@playwright/test";

import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";
import { helpSectionManifest } from "../src/features/help/help-section-manifest";
import { DashboardApiFixture, LOCATION_A, ORG_A, supervisorContext } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { locationIntelligenceReply } from "./support/md05-intelligence-fixtures";
import { managerReportsFixture, loadReport, enterManagerReports } from "./support/md05-reports-e2e-helpers";

const routes = [
  { path: "/overview", key: "overview.page", group: "overview" },
  { path: "/payments", key: "payments.page", group: "payments" },
  { path: "/analytics", key: "analytics.page", group: "analytics" },
  { path: "/reports", key: "reports.page", group: "reports" },
] as const;

function trigger(page: Page, key: ContextHelpKey) {
  return page.getByRole("button", { name: "Help: " + contextHelpRegistry[key].en.title, exact: true });
}

test("four authorized Intelligence pages have exact help without data reads, exports or writes", async ({ page }, testInfo) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (!["GET", "HEAD"].includes(request.method()) && !path.startsWith("/v1/staff/auth/")) {
        writes.push(request.method() + " " + path);
      }
      return locationIntelligenceReply(path, request);
    },
  });
  await fixture.install(page);
  await page.goto("/overview");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  for (const { path, key, group } of routes) {
    await page.goto(path);
    await expect(trigger(page, key)).toHaveCount(1);
    await page.waitForLoadState("networkidle", { timeout: 12_000 });
    const before = [...fixture.counts.entries()].sort();
    await trigger(page, key).click();
    const dialog = page.getByRole("dialog", { name: contextHelpRegistry[key].en.title });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(contextHelpRegistry[key].en.body);
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    expect([...fixture.counts.entries()].sort()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath(group + "-en-light-help.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger(page, key)).toBeFocused();
    expect(writes).toEqual([]);
  }
});

test("Arabic Intelligence help updates localized content in-place", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => locationIntelligenceReply(path, request),
  });
  await fixture.install(page);
  await page.goto("/payments");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Language" }).click();
  const copy = contextHelpRegistry["payments.page"].ar;
  await page.getByRole("button", { name: "مساعدة: " + copy.title }).click();
  const dialog = page.getByRole("dialog", { name: copy.title });
  await expect(dialog).toContainText(copy.body);
  await expect(dialog.locator('[lang="ar"][dir="rtl"]')).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "إغلاق" })).toBeVisible();
});

test("Supervisor has no protected Intelligence help surfaces", async ({ page }) => {
  const fixture = new DashboardApiFixture({ operationalContexts: [supervisorContext()] });
  await fixture.install(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await expect(page.getByRole("button", { name: /^Help:/ })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Intelligence manifest retains exactly 14 section keys", () => {
  const keys = routes.flatMap(({ group }) => helpSectionManifest[group]);
  expect(keys).toHaveLength(14);
  expect(new Set(keys).size).toBe(14);
});

test("all 14 Intelligence subsection help controls mount in their owning surface", async ({ page }) => {
  page.setDefaultTimeout(8_000);
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => locationIntelligenceReply(path, request),
  });
  await fixture.install(page);
  await page.goto("/overview");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  async function assertHelp(key: ContextHelpKey) {
    await expect(trigger(page, key)).toBeVisible();
    await trigger(page, key).click();
    const dialog = page.getByRole("dialog", { name: contextHelpRegistry[key].en.title });
    await expect(dialog).toContainText(contextHelpRegistry[key].en.body);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  for (const key of helpSectionManifest.overview) await assertHelp(key);
  await page.goto("/payments");
  for (const key of helpSectionManifest.payments) await assertHelp(key);
  await page.goto("/analytics");
  for (const key of helpSectionManifest.analytics) await assertHelp(key);

  await page.goto("/reports");
  await assertHelp("reports.catalog");
  await page.getByRole("button", { name: "Preview Daily Report" }).click();
  await assertHelp("reports.preview");
  await expect(page.getByRole("dialog", { name: "Preview Daily Report" })).toBeVisible();
  await page.getByRole("dialog", { name: "Preview Daily Report" })
    .getByRole("button", { name: "Close", exact: true }).click();

  // reports.export has its own test using a successfully loaded preview.
});

test("loaded authorized report displays export help without triggering an export", async ({ page }) => {
  const fixture = managerReportsFixture();
  await fixture.install(page);
  await enterManagerReports(page);
  const dialog = await loadReport(page, "DAILY");
  await expect(dialog.getByTestId("report-preview-content")).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 12_000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const before = [...fixture.counts.entries()].sort();
  const key = "reports.export";
  await trigger(page, key).click();
  const help = page.getByRole("dialog", { name: contextHelpRegistry[key].en.title });
  await expect(help).toContainText(contextHelpRegistry[key].en.body);
  expect([...fixture.counts.entries()].sort()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Export CSV/i })).toBeEnabled();
  expect(errors).toEqual([]);
});
