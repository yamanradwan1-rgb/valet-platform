import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import { companyAnalytics, companyAnalyticsPath, PERIOD_A } from "./md05-intelligence-fixtures";
const referenceRoot = resolve(process.cwd(), "../../reference/vaylet- man dashboard");

function proveMd05FrozenSource() {
  const source = (path: string) => readFileSync(resolve(referenceRoot, path), "utf8");
  const anchors: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["src/pages/OverviewPage.tsx", [
      "space-y-6 animate-in fade-in duration-200",
      "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
      "grid grid-cols-1 lg:grid-cols-12 gap-6",
      'gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E293B]',
    ]],
    ["src/components/data/MetricCard.tsx", [
      "rounded-xl p-5 shadow-subtle flex flex-col justify-between",
      "text-3xl font-bold text-slate-900 dark:text-white tracking-tight",
      "w-11 h-11 rounded-full",
      "gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold",
    ]],
    ["src/components/charts/ActivityAreaChart.tsx", [
      "const paddingLeft = 35;",
      'strokeDasharray="4 4"',
      'strokeWidth="2.5"',
      'className="transition-all duration-150"',
    ]],
    ["src/pages/PaymentsPage.tsx", [
      "flex flex-col sm:flex-row sm:items-center justify-between gap-4",
      "gap-2 px-3.5 py-2 bg-white dark:bg-[#0D152F]",
      "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
      "p-5 rounded-xl border border-slate-200 dark:border-[#172346] shadow-sm",
      "px-2 py-0.5 rounded-md mt-2.5",
      "p-4 sm:p-5",
      "font-mono font-semibold",
    ]],
    ["src/pages/ValidationsPage.tsx", [
      "px-6 pt-4 border-b border-slate-100 dark:border-[#172346]",
      "pb-3 text-xs font-bold transition-all relative",
      "text-[#1E60F0] border-b-2 border-[#1E60F0]",
      "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm",
      "rounded-2xl w-full max-w-md overflow-hidden shadow-2xl",
      "p-1.5 rounded-lg text-slate-400",
      "w-full px-3 py-2 bg-slate-50 dark:bg-[#131E3D]",
      "px-4 py-2 rounded-lg bg-[#1E60F0] text-white font-semibold",
    ]],
  ];
  for (const [path, snippets] of anchors) {
    const text = source(path);
    for (const snippet of snippets) expect(text).toContain(snippet);
  }
  expect(source("tailwind.config.js")).toContain("plugins: []");
  expect(source("package.json")).not.toContain("tailwindcss-animate");
}
async function columns(locator: Locator) {
  return locator.evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(" ").length
  );
}

async function expectCardSurface(card: Locator, shadowOpacity: string) {
  await expect(card).toHaveCSS("padding", "20px");
  await expect(card).toHaveCSS("border-radius", "12px");
  await expect(card).toHaveCSS("border-color", "rgb(226, 232, 240)");
  await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(card).toHaveCSS(
    "box-shadow",
    new RegExp("rgba\\(0, 0, 0, " + shadowOpacity + "\\) 0px 1px 2px", "u"),
  );
}

async function expectPeriodDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  const backdrop = dialog.locator("..");
  await expect(backdrop).toHaveCSS("padding", "16px");
  await expect(backdrop).toHaveCSS("background-color", "rgba(0, 0, 0, 0.6)");
  await expect(backdrop).toHaveCSS("backdrop-filter", "blur(4px)");
  await expect(dialog).toHaveCSS("max-width", "448px");
  await expect(dialog).toHaveCSS("border-radius", "16px");
  await expect(dialog).toHaveCSS("border-color", "rgb(226, 232, 240)");
  await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const header = dialog.locator("header");
  await expect(header).toHaveCSS("padding", "20px");
  await expect(header).toHaveCSS("border-bottom-color", "rgb(241, 245, 249)");
  await expect(header.getByRole("heading")).toHaveCSS("font-size", "16px");
  await expect(header.getByRole("heading")).toHaveCSS("font-weight", "700");
  const close = header.locator("..").getByRole("button", { name: /Cancel|إلغاء/u }).last();
  await expect(close).toHaveCSS("padding", "6px");
  await expect(close).toHaveCSS("border-radius", "8px");
  await expect(close.locator("svg")).toHaveAttribute("width", "20");
  const form = dialog.locator("form");
  await expect(form).toHaveCSS("padding", "20px");
  await expect(form).toHaveCSS("row-gap", "16px");
  const from = dialog.getByLabel(/From|من/u);
  await expect(from).toBeFocused();
  await expect(from.locator("..")).toHaveCSS("font-size", "12px");
  await expect(from.locator("..")).toHaveCSS("font-weight", "600");
  await expect(from).toHaveCSS("padding-left", "12px");
  await expect(from).toHaveCSS("padding-top", "8px");
  await expect(from).toHaveCSS("border-radius", "8px");
  await expect(from).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await expect(from).toHaveCSS("border-color", "rgb(226, 232, 240)");
  const apply = dialog.getByRole("button", { name: /Apply|تطبيق/u });
  await expect(apply).toHaveCSS("padding-left", "16px");
  await expect(apply).toHaveCSS("padding-top", "8px");
  await expect(apply).toHaveCSS("border-radius", "8px");
  await expect(apply).toHaveCSS("font-weight", "600");
  await expect(apply).toHaveCSS("background-color", "rgb(30, 96, 240)");
}

async function selectPeriod(page: Page) {
  await page.locator('[data-testid^="md05-"][data-testid$="-page"] button[aria-haspopup="dialog"]').click();
  await expectPeriodDialog(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill(PERIOD_A.from);
  await dialog.getByLabel("To").fill(PERIOD_A.to);
  await dialog.getByRole("button", { name: "Apply" }).click();
}

async function expectOverview(page: Page, metricColumns: number, lowerColumns: number) {
  const root = page.getByTestId("md05-overview-page");
  await expect(root).toHaveCSS("row-gap", "24px");
  await expect(root).toHaveCSS("animation-name", "none");
  const title = root.getByRole("heading", { level: 1 });
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("line-height", "32px");
  await expect(title).toHaveCSS("font-weight", "700");
  await expect(title).toHaveCSS("letter-spacing", "-0.6px");
  const subtitle = title.locator("..").locator("p");
  await expect(subtitle).toHaveCSS("font-size", "14px");
  await expect(subtitle).toHaveCSS("margin-top", "4px");
  const grid = root.locator('[class*="metricGrid"]');
  await expect(grid).toHaveCSS("gap", "16px");
  await expect.poll(() => columns(grid)).toBe(metricColumns);
  const cards = root.locator('[class*="metricCard"]');
  await expect(cards).toHaveCount(4);
  await expectCardSurface(cards.first(), "0.04");
  const value = cards.first().locator('[class*="metricValue"]');
  await expect(value).toHaveCSS("font-size", "30px");
  await expect(value).toHaveCSS("font-weight", "700");
  const label = cards.first().locator('[class*="metricLabel"]');
  await expect(label).toHaveCSS("font-size", "14px");
  await expect(label).toHaveCSS("font-weight", "500");
  const icon = cards.first().locator('[class*="metricIcon"]');
  await expect(icon).toHaveCSS("width", "44px");
  await expect(icon).toHaveCSS("height", "44px");
  await expect(icon).toHaveCSS("border-radius", "9999px");
  await expect(icon).toHaveCSS("background-color", "rgb(239, 246, 255)");
  const context = cards.first().locator('[class*="metricPill"]');
  await expect(context).toHaveCSS("padding-left", "8px");
  await expect(context).toHaveCSS("padding-top", "2px");
  await expect(context).toHaveCSS("border-color", "rgb(191, 219, 254)");
  const lower = root.locator('[class*="lowerGrid"]');
  await expect(lower).toHaveCSS("gap", "24px");
  await expect.poll(() => columns(lower)).toBe(lowerColumns);
  const activity = root.getByRole("heading", { name: /Vehicle Activity|نشاط المركبات/u }).locator("..").locator("..");
  await expect(activity).toHaveCSS("padding", "20px");
  await expect(activity).toHaveCSS("border-radius", "12px");
  await expect(activity).toHaveCSS("border-color", "rgb(226, 232, 240)");
  const activityTitle = activity.getByRole("heading");
  await expect(activityTitle).toHaveCSS("font-size", "16px");
  await expect(activityTitle).toHaveCSS("font-weight", "700");
  const opener = activity.getByRole("button", { name: /Select period|اختيار الفترة|2026/u });
  await expect(opener).toHaveCSS("padding-left", "10px");
  await expect(opener).toHaveCSS("padding-top", "6px");
  await expect(opener).toHaveCSS("gap", "6px");
  await expect(opener).toHaveCSS("border-radius", "8px");
  await expect(opener).toHaveCSS("font-size", "12px");
  await expect(opener).toHaveCSS("font-weight", "500");
  await expect(opener).toHaveCSS("box-shadow", "none");
  await expect(opener.locator("svg")).toHaveCSS("color", "rgb(148, 163, 184)");
  const chart = activity.getByRole("img");
  await expect(chart).toHaveCSS("height", "260px");
  await expect(chart).toHaveCSS("overflow", "visible");
  await expect(chart.locator('[class*="chartLine"]')).toHaveCSS("stroke", "rgb(30, 96, 240)");
  await expect(chart.locator('[class*="chartLine"]')).toHaveCSS("stroke-width", "2.5px");
}

async function expectPayments(page: Page, summaryColumns: number) {
  const root = page.getByTestId("md05-payments-page");
  await expect(root).toHaveCSS("row-gap", "24px");
  await expect(root).toHaveCSS("animation-name", "none");
  const title = root.getByRole("heading", { level: 1 });
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("line-height", "32px");
  await expect(title).toHaveCSS("font-weight", "700");
  await expect(title).toHaveCSS("letter-spacing", "normal");
  const opener = root.locator('button[aria-haspopup="dialog"]');
  await expect(opener).toHaveCSS("padding-left", "14px");
  await expect(opener).toHaveCSS("padding-top", "8px");
  await expect(opener).toHaveCSS("gap", "8px");
  await expect(opener).toHaveCSS("border-radius", "8px");
  await expect(opener).toHaveCSS("font-size", "12px");
  await expect(opener).toHaveCSS("font-weight", "500");
  await expect(opener.locator("svg").first()).toHaveCSS("color", "rgb(148, 163, 184)");
  const grid = root.locator('[class*="summaryGrid"]');
  await expect(grid).toHaveCSS("gap", "16px");
  await expect.poll(() => columns(grid)).toBe(summaryColumns);
  const cards = root.locator('[class*="summaryCard"]');
  await expect(cards).toHaveCount(4);
  await expectCardSurface(cards.first(), "0.05");
  const value = cards.first().locator('[class*="summaryValues"]');
  await expect(value).toHaveCSS("font-size", "24px");
  await expect(value).toHaveCSS("font-weight", "800");
  const label = cards.first().locator('[class*="summaryLabel"]');
  await expect(label).toHaveCSS("font-size", "12px");
  await expect(label).toHaveCSS("font-weight", "400");
  const trendSpace = cards.first().locator('[class*="summaryTrendSpace"]');
  await expect(trendSpace).toHaveCSS("height", "20px");
  await expect(trendSpace).toHaveCSS("margin-top", "10px");
  const icon = cards.first().locator('[class*="summaryIcon"]');
  await expect(icon).toHaveCSS("width", "40px");
  await expect(icon).toHaveCSS("height", "40px");
  await expect(icon).toHaveCSS("border-radius", "12px");
  const panel = root.getByRole("heading", { name: /Financial Breakdown|التفصيل المالي/u }).locator("..").locator("..");
  await expect(panel).toHaveCSS("border-radius", "12px");
  await expect(panel).toHaveCSS("border-color", "rgb(226, 232, 240)");
  const panelHeader = panel.getByRole("heading", { level: 2 }).locator("..");
  await expect(panelHeader).toHaveCSS("padding", summaryColumns === 1 ? "16px" : "20px");
  await expect(panelHeader).toHaveCSS("border-bottom-color", "rgb(241, 245, 249)");
  const th = panel.getByRole("columnheader").first();
  await expect(th).toHaveCSS("padding-left", "20px");
  await expect(th).toHaveCSS("padding-top", "12px");
  await expect(th).toHaveCSS("font-size", "12px");
  await expect(th).toHaveCSS("font-weight", "600");
  await expect(th).toHaveCSS("background-color", "rgba(248, 250, 252, 0.5)");
  const validation = panel.getByRole("heading", { name: /Validation summary|ملخص التحقق/u });
  await expect(validation).toHaveCSS("font-size", "12px");
  await expect(validation).toHaveCSS("padding-bottom", "12px");
  await expect(validation).toHaveCSS("border-bottom-width", "2px");
  await expect(validation.locator("..")).toHaveCSS("padding-left", "24px");
}

function visualFixture() {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) =>
      path === companyAnalyticsPath ? { body: companyAnalytics(request) } : undefined,
  });
}

async function enterCompany(page: Page, path: string) {
  await page.goto(path);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

export async function proveOverviewReferenceGeometry(page: Page) {
  proveMd05FrozenSource();
  await visualFixture().install(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterCompany(page, "/overview");
  await selectPeriod(page);
  await expectOverview(page, 4, 2);
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator('[class*="metricCard"]').first()).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await page.getByRole("button", { name: "Light" }).click();
  await page.setViewportSize({ width: 480, height: 900 }); await expectOverview(page, 1, 1);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectOverview(page, 4, 2);
  await page.setViewportSize({ width: 480, height: 900 });
  await expectOverview(page, 1, 1);
  const opener = page.locator('[data-testid="md05-overview-page"] button[aria-haspopup="dialog"]');
  await opener.click();
  await expectPeriodDialog(page);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
}

export async function provePaymentsReferenceGeometry(page: Page) {
  proveMd05FrozenSource();
  await visualFixture().install(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterCompany(page, "/payments");
  await selectPeriod(page);
  await expectPayments(page, 4);
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator('[class*="summaryCard"]').first()).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await page.getByRole("button", { name: "Light" }).click();
  await page.setViewportSize({ width: 480, height: 900 }); await expectPayments(page, 1);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectPayments(page, 4);
  await page.setViewportSize({ width: 480, height: 900 });
  await expectPayments(page, 1);
  const opener = page.locator('[data-testid="md05-payments-page"] button[aria-haspopup="dialog"]');
  await opener.click();
  await expectPeriodDialog(page);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
}
