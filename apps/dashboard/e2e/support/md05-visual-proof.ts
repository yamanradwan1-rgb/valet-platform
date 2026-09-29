import { expect, type Locator, type Page } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import { companyAnalytics, companyAnalyticsPath, PERIOD_A } from "./md05-intelligence-fixtures";
import { MD05_VISUAL_CONTRACT } from "./md05-visual-contract";

async function columns(locator: Locator) {
  return locator.evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(" ").length
  );
}

async function roundedBoxes(locator: Locator) {
  return locator.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }));
}

async function expectOverviewDesktopGeometry(page: Page) {
  const { desktopCards, desktopPanels } = MD05_VISUAL_CONTRACT.overview;
  const root = page.getByTestId("md05-overview-page");
  await expect.poll(() => roundedBoxes(root.locator('[class*="metricCard"]')))
    .toEqual(desktopCards.map((box) => ({ ...box, y: desktopCards[0]!.y + 63 })));
  await expect.poll(() => roundedBoxes(root.locator('[class*="lowerGrid"] > *')))
    .toEqual(desktopPanels.map((box) => ({ ...box, y: box.y + 63 })));
}

async function expectCardSurface(card: Locator, shadowOpacity: string, dark: boolean) {
  const { common } = MD05_VISUAL_CONTRACT;
  await expect(card).toHaveCSS("padding", common.cardPadding);
  await expect(card).toHaveCSS("border-radius", common.cardRadius);
  if (!dark) await expect(card).toHaveCSS("border-color", common.lightBorder);
  await expect(card).toHaveCSS(
    "background-color",
    dark ? common.darkSurface : common.lightSurface,
  );
  await expect(card).toHaveCSS(
    "box-shadow",
    new RegExp("rgba\\(0, 0, 0, " + shadowOpacity + "\\) 0px 1px 2px", "u"),
  );
}

async function expectPeriodDialog(page: Page, dark = false) {
  const { common, periodDialog } = MD05_VISUAL_CONTRACT;
  const dialog = page.getByRole("dialog");
  const backdrop = dialog.locator("..");
  await expect(backdrop).toHaveCSS("padding", periodDialog.backdropPadding);
  await expect(backdrop).toHaveCSS("background-color", periodDialog.backdropBackground);
  await expect(backdrop).toHaveCSS("backdrop-filter", periodDialog.backdropBlur);
  await expect(dialog).toHaveCSS("max-width", periodDialog.panelMaxWidth);
  await expect(dialog).toHaveCSS("border-radius", periodDialog.panelRadius);
  if (!dark) await expect(dialog).toHaveCSS("border-color", common.lightBorder);
  await expect(dialog).toHaveCSS(
    "background-color",
    dark ? common.darkSurface : common.lightSurface,
  );
  const header = dialog.locator("header");
  await expect(header).toHaveCSS("padding", periodDialog.headerPadding);
  if (!dark) await expect(header).toHaveCSS("border-bottom-color", periodDialog.headerBorder);
  await expect(header.getByRole("heading")).toHaveCSS("font-size", periodDialog.headingFontSize);
  await expect(header.getByRole("heading")).toHaveCSS("font-weight", periodDialog.headingWeight);
  const close = header.locator("..").getByRole("button", { name: /Cancel|إلغاء/u }).last();
  await expect(close).toHaveCSS("padding", periodDialog.closePadding);
  await expect(close).toHaveCSS("border-radius", periodDialog.closeRadius);
  await expect(close.locator("svg")).toHaveAttribute("width", periodDialog.closeIconWidth);
  const form = dialog.locator("form");
  await expect(form).toHaveCSS("padding", periodDialog.formPadding);
  await expect(form).toHaveCSS("row-gap", periodDialog.formGap);
  const from = dialog.getByLabel(/From|من/u);
  await expect(from).toBeFocused();
  await expect(from.locator("..")).toHaveCSS("font-size", periodDialog.fieldFontSize);
  await expect(from.locator("..")).toHaveCSS("font-weight", periodDialog.fieldWeight);
  await expect(from).toHaveCSS("padding-left", periodDialog.inputPaddingInline);
  await expect(from).toHaveCSS("padding-top", periodDialog.inputPaddingBlock);
  await expect(from).toHaveCSS("border-radius", periodDialog.inputRadius);
  if (!dark) {
    await expect(from).toHaveCSS("background-color", periodDialog.inputBackground);
    await expect(from).toHaveCSS("border-color", common.lightBorder);
  }
  const apply = dialog.getByRole("button", { name: /Apply|تطبيق/u });
  await expect(apply).toHaveCSS("padding-left", periodDialog.actionPaddingInline);
  await expect(apply).toHaveCSS("padding-top", periodDialog.actionPaddingBlock);
  await expect(apply).toHaveCSS("border-radius", periodDialog.actionRadius);
  await expect(apply).toHaveCSS("font-weight", periodDialog.actionWeight);
  await expect(apply).toHaveCSS("background-color", periodDialog.primary);
}

async function expectPeriodDialogRoundTrip(page: Page, testId: string, dark: boolean) {
  const opener = page.locator(`[data-testid="${testId}"] button[aria-haspopup="dialog"]`);
  await opener.click();
  await expectPeriodDialog(page, dark);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
}

async function selectPeriod(page: Page) {
  await page.locator('[data-testid^="md05-"][data-testid$="-page"] button[aria-haspopup="dialog"]').click();
  await expectPeriodDialog(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("From").fill(PERIOD_A.from);
  await dialog.getByLabel("To").fill(PERIOD_A.to);
  await dialog.getByRole("button", { name: "Apply" }).click();
}

async function expectOverview(page: Page, metricColumns: number, lowerColumns: number, dark: boolean) {
  const { activityChart, common, overview } = MD05_VISUAL_CONTRACT;
  const root = page.getByTestId("md05-overview-page");
  await expect(root).toHaveCSS("row-gap", common.pageGap);
  await expect(root).toHaveCSS("animation-name", common.renderedPageAnimationName);
  const title = root.getByRole("heading", { level: 1 });
  await expect(title).toHaveCSS("font-size", common.titleFontSize);
  await expect(title).toHaveCSS("line-height", common.titleLineHeight);
  await expect(title).toHaveCSS("font-weight", common.titleWeight);
  await expect(title).toHaveCSS("letter-spacing", overview.titleLetterSpacing);
  const subtitle = title.locator("..").locator("p");
  await expect(subtitle).toHaveCSS("font-size", overview.subtitleFontSize);
  await expect(subtitle).toHaveCSS("margin-top", overview.subtitleMarginTop);
  const grid = root.locator('[class*="metricGrid"]');
  await expect(grid).toHaveCSS("gap", overview.gridGap);
  await expect.poll(() => columns(grid)).toBe(metricColumns);
  const cards = root.locator('[class*="metricCard"]');
  await expect(cards).toHaveCount(4);
  await expectCardSurface(cards.first(), overview.cardShadowOpacity, dark);
  const value = cards.first().locator('[class*="metricValue"]');
  await expect(value).toHaveCSS("font-size", overview.valueFontSize);
  await expect(value).toHaveCSS("font-weight", overview.valueWeight);
  const label = cards.first().locator('[class*="metricLabel"]');
  await expect(label).toHaveCSS("font-size", overview.labelFontSize);
  await expect(label).toHaveCSS("font-weight", overview.labelWeight);
  const icon = cards.first().locator('[class*="metricIcon"]');
  await expect(icon).toHaveCSS("width", overview.iconSize);
  await expect(icon).toHaveCSS("height", overview.iconSize);
  await expect(icon).toHaveCSS("border-radius", overview.iconRadius);
  if (!dark) await expect(icon).toHaveCSS("background-color", overview.iconBackground);
  const context = cards.first().locator('[class*="metricPill"]');
  await expect(context).toHaveCSS("padding-left", overview.contextPaddingInline);
  await expect(context).toHaveCSS("padding-top", overview.contextPaddingBlock);
  if (!dark) await expect(context).toHaveCSS("border-color", overview.contextBorder);
  const lower = root.locator('[class*="lowerGrid"]');
  await expect(lower).toHaveCSS("gap", overview.lowerGap);
  await expect.poll(() => columns(lower)).toBe(lowerColumns);
  const activity = root.getByRole("heading", { name: /Vehicle Activity|نشاط المركبات/u }).locator("..").locator("..");
  await expect(activity).toHaveCSS("padding", common.cardPadding);
  await expect(activity).toHaveCSS("border-radius", common.cardRadius);
  if (!dark) await expect(activity).toHaveCSS("border-color", common.lightBorder);
  const activityTitle = activity.getByRole("heading");
  await expect(activityTitle).toHaveCSS("font-size", overview.activityTitleFontSize);
  await expect(activityTitle).toHaveCSS("font-weight", overview.activityTitleWeight);
  const control = root.getByTestId("dashboard-period-control");
  await expect(control.getByRole("button")).toHaveCount(8);
  await expect(control.getByRole("button", { name: /Custom|مخصص/u })).toHaveAttribute("aria-pressed", "true");
  const chart = activity.getByRole("img");
  await expect(chart).toHaveCSS("height", activityChart.height);
  await expect(chart).toHaveCSS("overflow", "visible");
  await expect(chart.locator('[class*="chartLine"]')).toHaveCSS("stroke", activityChart.line);
  await expect(chart.locator('[class*="chartLine"]')).toHaveCSS("stroke-width", activityChart.lineWidth);
}

async function expectPayments(page: Page, summaryColumns: number, dark: boolean) {
  const { common, payments, validation: validationContract } = MD05_VISUAL_CONTRACT;
  const root = page.getByTestId("md05-payments-page");
  await expect(root).toHaveCSS("row-gap", common.pageGap);
  await expect(root).toHaveCSS("animation-name", common.renderedPageAnimationName);
  const title = root.getByRole("heading", { level: 1 });
  await expect(title).toHaveCSS("font-size", common.titleFontSize);
  await expect(title).toHaveCSS("line-height", common.titleLineHeight);
  await expect(title).toHaveCSS("font-weight", common.titleWeight);
  await expect(title).toHaveCSS("letter-spacing", payments.titleLetterSpacing);
  const control = root.getByTestId("dashboard-period-control");
  await expect(control.getByRole("button")).toHaveCount(8);
  await expect(control.getByRole("button", { name: /Custom|مخصص/u })).toHaveAttribute("aria-pressed", "true");
  const grid = root.locator('[class*="summaryGrid"]');
  await expect(grid).toHaveCSS("gap", payments.gridGap);
  await expect.poll(() => columns(grid)).toBe(summaryColumns);
  const cards = root.locator('[class*="summaryCard"]');
  await expect(cards).toHaveCount(4);
  await expectCardSurface(cards.first(), payments.cardShadowOpacity, dark);
  const value = cards.first().locator('[class*="summaryValues"]');
  await expect(value).toHaveCSS("font-size", payments.valueFontSize);
  await expect(value).toHaveCSS("font-weight", payments.valueWeight);
  const label = cards.first().locator('[class*="summaryLabel"]');
  await expect(label).toHaveCSS("font-size", payments.labelFontSize);
  await expect(label).toHaveCSS("font-weight", payments.labelWeight);
  const trendSpace = cards.first().locator('[class*="summaryTrendSpace"]');
  await expect(trendSpace).toHaveCSS("height", payments.trendSpaceHeight);
  await expect(trendSpace).toHaveCSS("margin-top", payments.trendSpaceMarginTop);
  const icon = cards.first().locator('[class*="summaryIcon"]');
  await expect(icon).toHaveCSS("width", payments.iconSize);
  await expect(icon).toHaveCSS("height", payments.iconSize);
  await expect(icon).toHaveCSS("border-radius", payments.iconRadius);
  const panel = root.getByRole("heading", { name: /Financial Breakdown|التفصيل المالي/u }).locator("..").locator("..");
  await expect(panel).toHaveCSS("border-radius", common.cardRadius);
  if (!dark) await expect(panel).toHaveCSS("border-color", common.lightBorder);
  const panelHeader = panel.getByRole("heading", { level: 2 }).locator("..");
  const panelHeaderPadding = summaryColumns === 1
    ? payments.narrowPanelHeaderPadding
    : payments.desktopPanelHeaderPadding;
  await expect(panelHeader).toHaveCSS("padding", panelHeaderPadding);
  await expect(panelHeader).toHaveCSS("border-bottom-color",
    dark ? payments.darkHeaderBorder : MD05_VISUAL_CONTRACT.periodDialog.headerBorder,
  );
  const th = panel.getByRole("columnheader").first();
  await expect(th).toHaveCSS("padding-left", payments.tablePaddingInline);
  await expect(th).toHaveCSS("padding-top", payments.tablePaddingBlock);
  await expect(th).toHaveCSS("font-size", payments.tableFontSize);
  await expect(th).toHaveCSS("font-weight", payments.tableWeight);
  if (!dark) await expect(th).toHaveCSS("background-color", payments.tableHeaderBackground);
  const validation = panel.getByRole("heading", { name: /Validation summary|ملخص التحقق/u });
  await expect(validation).toHaveCSS("font-size", validationContract.tabFontSize);
  await expect(validation).toHaveCSS("padding-bottom", validationContract.tabPaddingBottom);
  await expect(validation).toHaveCSS("border-bottom-width", validationContract.tabUnderline);
  await expect(validation.locator("..")).toHaveCSS(
    "padding-left",
    validationContract.sectionPaddingInline,
  );
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
  await visualFixture().install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterCompany(page, "/overview");
  await expectOverviewDesktopGeometry(page);
  await selectPeriod(page);
  await expectOverviewDesktopGeometry(page);
  for (const locale of ["en", "ar"] as const) {
    if (locale === "ar") {
      await page.getByRole("button", { name: "Language" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    for (const narrow of [false, true]) {
      await page.setViewportSize({ width: narrow ? 480 : 1440, height: 900 });
      for (const dark of [false, true]) {
        await page.locator(".theme-segmented button").nth(dark ? 1 : 0).click();
        await expectOverview(page, narrow ? 1 : 4, narrow ? 1 : 12, dark);
        if (narrow) {
          await expect.poll(() => page.evaluate(() =>
            document.documentElement.scrollWidth <= window.innerWidth,
          )).toBe(true);
        }
        await expectPeriodDialogRoundTrip(page, "md05-overview-page", dark);
      }
    }
  }
}

export async function provePaymentsReferenceGeometry(page: Page) {
  await visualFixture().install(page);
  await enterCompany(page, "/payments");
  await selectPeriod(page);
  for (const locale of ["en", "ar"] as const) {
    if (locale === "ar") {
      await page.getByRole("button", { name: "Language" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    for (const narrow of [false, true]) {
      await page.setViewportSize({ width: narrow ? 480 : 1280, height: 900 });
      for (const dark of [false, true]) {
        await page.locator(".theme-segmented button").nth(dark ? 1 : 0).click();
        await expectPayments(page, narrow ? 1 : 4, dark);
        await expectPeriodDialogRoundTrip(page, "md05-payments-page", dark);
      }
    }
  }
}
