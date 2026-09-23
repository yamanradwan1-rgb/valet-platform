import { expect, type Locator, type Page } from "@playwright/test";

import {
  applyAnalyticsPeriod,
  enterCompanyAnalytics,
  standardCompanyFixture,
} from "./md05-analytics-fixtures";
import { MD05_ANALYTICS_VISUAL_CONTRACT as contract } from "./md05-analytics-visual-contract";

async function columnCount(locator: Locator): Promise<number> {
  return locator.evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
  );
}

async function expectSelectorGeometry(page: Page, rtl: boolean) {
  const selectors = page.getByTestId("analytics-header-selectors");
  const period = selectors.locator("button").nth(0);
  const scope = selectors.locator("button").nth(1);
  await expect(selectors).toHaveCSS("gap", contract.page.selectorGap);
  await expect(period).toHaveCSS("border-radius", contract.select.radius);
  await expect(period).toHaveCSS("padding-top", contract.select.periodPaddingBlock);
  await expect(period).toHaveCSS("padding-left", contract.select.periodPaddingInline);
  await expect(period).toHaveCSS("column-gap", contract.select.periodGap);
  await expect(period).toHaveCSS("font-size", contract.select.periodSize);
  const periodIcons = period.locator("svg");
  await expect(periodIcons.nth(0)).toHaveAttribute("width", contract.select.periodCalendarSize);
  await expect(periodIcons.nth(1)).toHaveAttribute("width", contract.select.periodChevronSize);
  await expect(periodIcons.nth(0)).toHaveCSS("color", contract.select.periodIconColor);
  await expect(periodIcons.nth(1)).toHaveCSS("color", contract.select.periodIconColor);
  await expect(scope).toHaveCSS("border-radius", contract.select.radius);
  await expect(scope).toHaveCSS("font-size", contract.select.scopeSize);
  await expect(scope).toHaveCSS(
    "padding-left",
    rtl ? contract.select.scopePaddingChevron : contract.select.scopePaddingNear,
  );
  await expect(scope).toHaveCSS(
    "padding-right",
    rtl ? contract.select.scopePaddingNear : contract.select.scopePaddingChevron,
  );
  const chevron = scope.locator("svg");
  await expect(chevron).toHaveAttribute("width", contract.select.scopeChevronSize);
  await expect(chevron).toHaveCSS("color", contract.select.scopeChevronColor);
  await expect(chevron).toHaveCSS(
    rtl ? "left" : "right",
    contract.select.chevronInset,
  );
}

async function expectCardGeometry(page: Page, columns: number) {
  const grid = page.getByTestId("analytics-card-grid");
  await expect.poll(() => columnCount(grid)).toBe(columns);
  await expect(grid).toHaveCSS("gap", contract.page.cardsGap);
  const card = page.getByTestId("analytics-metric-card").first();
  await expect(card).toHaveCSS("padding", contract.metricCard.padding);
  await expect(card).toHaveCSS("border-radius", contract.metricCard.radius);
  await expect(card).toHaveCSS(
    "box-shadow",
    new RegExp(`rgba\\(0, 0, 0, ${contract.metricCard.shadowOpacity}\\) 0px 1px 2px`, "u"),
  );
  const value = card.getByTestId("analytics-card-value");
  await expect(value).toHaveCSS("font-size", contract.metricCard.valueSize);
  await expect(value).toHaveCSS("line-height", contract.metricCard.valueLineHeight);
  await expect(value).toHaveCSS("font-weight", contract.metricCard.valueWeight);
  const label = card.getByTestId("analytics-card-label");
  await expect(label).toHaveCSS("font-size", contract.metricCard.labelSize);
  await expect(label).toHaveCSS("font-weight", contract.metricCard.labelWeight);
  const icon = card.getByTestId("analytics-card-icon");
  await expect(icon).toHaveCSS("width", contract.metricCard.iconSize);
  await expect(icon).toHaveCSS("height", contract.metricCard.iconSize);
  await expect(icon).toHaveCSS("border-radius", contract.metricCard.iconRadius);
  await expect(icon).toHaveCSS("color", contract.metricCard.representativeTone);
  await expect(icon.locator("svg")).toHaveAttribute("width", contract.metricCard.iconSvgSize);
}

async function expectChartGeometry(page: Page, columns: number, dark: boolean) {
  const grid = page.getByTestId("analytics-chart-grid");
  await expect.poll(() => columnCount(grid)).toBe(columns);
  await expect(grid).toHaveCSS("gap", contract.page.chartsGap);
  const panel = page.getByTestId("analytics-chart-panel").first();
  await expect(panel).toHaveCSS("padding", contract.chartPanel.padding);
  await expect(panel).toHaveCSS("border-radius", contract.chartPanel.radius);
  await expect(panel).toHaveCSS(
    "box-shadow",
    new RegExp(`rgba\\(0, 0, 0, ${contract.chartPanel.shadowOpacity}\\) 0px 1px 2px`, "u"),
  );
  const panelTitle = panel.getByRole("heading", { level: 2 });
  await expect(panelTitle).toHaveCSS("font-size", contract.chartPanel.titleSize);
  await expect(panelTitle).toHaveCSS("line-height", contract.chartPanel.titleLineHeight);
  await expect(panelTitle).toHaveCSS("font-weight", contract.chartPanel.titleWeight);
  const activity = page.getByTestId("analytics-activity-chart");
  const activitySvg = activity.getByRole("img");
  await expect(activitySvg).toHaveCSS("height", contract.vehicleBarChart.height);
  const bar = activitySvg.locator("rect").first();
  await expect(bar).toHaveCSS("fill", contract.vehicleBarChart.barFill);
  await expect(bar).toHaveAttribute("rx", contract.vehicleBarChart.barRadius);
  const activityYAxis = activitySvg.locator("text").first();
  await expect(activityYAxis).toHaveAttribute("x", contract.vehicleBarChart.yTickX);
  await expect(activityYAxis).toHaveCSS(
    "font-size",
    contract.vehicleBarChart.axisSize,
  );
  await expect(activityYAxis).toHaveCSS("fill", contract.vehicleBarChart.yAxisFill);
  await expect(activitySvg.locator('[class*="chartAxisX"]').first()).toHaveCSS(
    "fill",
    contract.vehicleBarChart.xAxisFill,
  );
  await expect(activitySvg.locator("line").first()).toHaveCSS(
    "stroke",
    dark
      ? contract.vehicleBarChart.darkGridStroke
      : contract.vehicleBarChart.lightGridStroke,
  );
  const duration = page.getByTestId("analytics-duration-chart");
  const durationSvg = duration.getByRole("img");
  await expect(durationSvg).toHaveCSS("height", contract.revenueLineChart.height);
  const line = durationSvg.locator('[class*="chartLine"]').first();
  await expect(line).toHaveCSS("stroke", contract.revenueLineChart.lineStroke);
  await expect(line).toHaveCSS("stroke-width", contract.revenueLineChart.lineWidth);
  await expect(durationSvg.locator('[class*="chartPoint"]').first()).toHaveCSS(
    "fill",
    contract.revenueLineChart.pointFill,
  );
  await expect(durationSvg.locator("text").first()).toHaveCSS(
    "fill",
    contract.revenueLineChart.yAxisFill,
  );
  await expect(durationSvg.locator("text").first()).toHaveAttribute(
    "x",
    contract.revenueLineChart.yTickX,
  );
  await expect(durationSvg.locator('[class*="chartAxisX"]').first()).toHaveCSS(
    "fill",
    contract.revenueLineChart.xAxisFill,
  );
}

async function expectTheme(page: Page, dark: boolean) {
  const card = page.getByTestId("analytics-metric-card").first();
  const panel = page.getByTestId("analytics-chart-panel").first();
  const control = page.getByTestId("analytics-header-selectors").locator("button").first();
  const surface = dark ? contract.theme.darkSurface : contract.theme.lightSurface;
  const border = dark ? contract.theme.darkBorder : contract.theme.lightBorder;
  await expect(card).toHaveCSS("background-color", surface);
  await expect(panel).toHaveCSS("background-color", surface);
  await expect(card).toHaveCSS("border-color", border);
  await expect(panel).toHaveCSS("border-color", border);
  await expect(control).toHaveCSS(
    "border-color",
    dark ? contract.theme.darkControlBorder : contract.theme.lightBorder,
  );
  await expect(control).toHaveCSS(
    "background-color",
    dark ? contract.theme.darkControl : contract.theme.lightSurface,
  );
  await expect(card.getByTestId("analytics-card-icon")).toHaveCSS(
    "background-color",
    dark ? contract.theme.darkControl : contract.metricCard.iconLightBackground,
  );
}

async function expectAnalyticsGeometry(
  page: Page,
  cardColumns: number,
  chartColumns: number,
  dark: boolean,
  rtl: boolean,
) {
  const root = page.getByTestId("md05-analytics-page");
  await expect(root).toHaveCSS("gap", contract.page.gap);
  const header = root.locator("header").first();
  await expect(header).toHaveCSS(
    "flex-direction",
    cardColumns === 1 ? contract.page.narrowHeaderDirection : contract.page.desktopHeaderDirection,
  );
  await expect(header).toHaveCSS(
    "align-items",
    cardColumns === 1 ? contract.page.narrowHeaderAlign : contract.page.desktopHeaderAlign,
  );
  await expect(header).toHaveCSS("justify-content", contract.page.headerJustify);
  await expect(header).toHaveCSS("gap", contract.page.headerGap);
  const title = root.getByRole("heading", { level: 1 });
  await expect(title).toHaveCSS("font-size", contract.page.titleSize);
  await expect(title).toHaveCSS("line-height", contract.page.titleLineHeight);
  await expect(title).toHaveCSS("font-weight", contract.page.titleWeight);
  await expect(title).toHaveCSS("letter-spacing", contract.page.titleTracking);
  const subtitle = title.locator("..").locator("p");
  await expect(subtitle).toHaveCSS("font-size", contract.page.subtitleSize);
  await expect(subtitle).toHaveCSS("margin-top", contract.page.subtitleMarginTop);
  await expectSelectorGeometry(page, rtl);
  await expectCardGeometry(page, cardColumns);
  await expectChartGeometry(page, chartColumns, dark);
  await expectTheme(page, dark);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  const index = theme === "light" ? 0 : 1;
  await page.locator(".theme-segmented button").nth(index).click();
}

export async function proveAnalyticsReferenceGeometry(page: Page) {
  await standardCompanyFixture().install(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterCompanyAnalytics(page);
  await applyAnalyticsPeriod(page);
  await expect(page.getByTestId("analytics-activity-chart")).toBeVisible();

  await expectAnalyticsGeometry(page, 4, 2, false, false);
  await setTheme(page, "dark");
  await expectAnalyticsGeometry(page, 4, 2, true, false);
  await page.setViewportSize({ width: 480, height: 900 });
  await expectAnalyticsGeometry(page, 1, 1, true, false);
  await setTheme(page, "light");
  await expectAnalyticsGeometry(page, 1, 1, false, false);

  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectAnalyticsGeometry(page, 1, 1, false, true);
  await setTheme(page, "dark");
  await expectAnalyticsGeometry(page, 1, 1, true, true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectAnalyticsGeometry(page, 4, 2, true, true);
  await setTheme(page, "light");
  await expectAnalyticsGeometry(page, 4, 2, false, true);
}
