import { expect, type Page } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import { companyReportReply } from "./md05-reports-fixtures";
import { MD05_REPORTS_VISUAL_CONTRACT as contract } from "./md05-reports-visual-contract";

async function enterReports(page: Page) {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => companyReportReply(path, request),
  });
  await fixture.install(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByTestId("md05-reports-page")).toBeVisible();
}

async function expectPageGeometry(page: Page, narrow: boolean, dark: boolean) {
  const root = page.getByTestId("md05-reports-page");
  await expect(root).toHaveCSS("gap", contract.page.gap);
  const header = root.locator("header").first();
  await expect(header).toHaveCSS(
    "flex-direction",
    narrow ? contract.page.narrowHeaderDirection : contract.page.desktopHeaderDirection,
  );
  await expect(header).toHaveCSS(
    "align-items",
    narrow ? contract.page.narrowHeaderAlign : contract.page.desktopHeaderAlign,
  );
  await expect(header).toHaveCSS("gap", contract.page.headerGap);
  const title = root.getByRole("heading", { level: 1 });
  await expect(title).toHaveCSS("font-size", contract.page.titleSize);
  await expect(title).toHaveCSS("line-height", contract.page.titleLineHeight);
  await expect(title).toHaveCSS("font-weight", contract.page.titleWeight);
  await expect(title).toHaveCSS("letter-spacing", contract.page.titleTracking);
  const subtitle = title.locator("..").locator("p");
  await expect(subtitle).toHaveCSS("font-size", contract.page.subtitleSize);
  await expect(subtitle).toHaveCSS("line-height", contract.page.subtitleLineHeight);
  await expect(subtitle).toHaveCSS("margin-top", contract.page.subtitleMarginTop);

  const container = root.locator('[class*="mainContainer"]');
  await expect(container).toHaveCSS("border-radius", contract.container.radius);
  await expect(container).toHaveCSS(
    "background-color",
    dark ? contract.container.darkSurface : contract.container.lightSurface,
  );
  await expect(container).toHaveCSS(
    "border-color",
    dark ? contract.container.darkBorder : contract.container.lightBorder,
  );
  await expect(container).toHaveCSS(
    "box-shadow",
    new RegExp(`rgba\\(0, 0, 0, ${contract.container.shadowOpacity}\\) 0px 1px 2px`, "u"),
  );
  await expectTableGeometry(page, dark);
}

async function expectTableGeometry(page: Page, dark: boolean) {
  const root = page.getByTestId("md05-reports-page");
  const tab = root.locator('[class*="tabs"]');
  await expect(tab).toHaveCSS("padding-left", contract.tab.paddingInline);
  await expect(tab).toHaveCSS("padding-top", contract.tab.paddingTop);
  await expect(tab).toHaveCSS("gap", contract.tab.gap);
  await expect(tab).toHaveCSS(
    "border-bottom-color",
    dark ? contract.tab.darkBorder : contract.tab.lightBorder,
  );
  const active = tab.locator("span");
  await expect(active).toHaveCSS("padding-bottom", contract.tab.paddingBottom);
  await expect(active).toHaveCSS("font-size", contract.tab.fontSize);
  await expect(active).toHaveCSS("line-height", contract.tab.lineHeight);
  await expect(active).toHaveCSS("font-weight", contract.tab.fontWeight);
  await expect(active).toHaveCSS("color", contract.tab.active);
  await expect(active).toHaveCSS("border-bottom-width", contract.tab.underline);

  const table = root.getByRole("table");
  const th = table.getByRole("columnheader").first();
  await expect(th.locator("..")).toHaveCSS(
    "background-color",
    dark ? contract.table.headerDark : contract.table.headerLight,
  );
  await expect(th).toHaveCSS("padding-left", contract.table.cellPaddingInline);
  await expect(th).toHaveCSS("padding-top", contract.table.headerPaddingBlock);
  await expect(th).toHaveCSS("font-size", contract.table.headerSize);
  await expect(th).toHaveCSS("line-height", contract.table.headerLineHeight);
  await expect(th).toHaveCSS("font-weight", contract.table.headerWeight);
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  const first = rows.first();
  await expect(first.locator("td").first()).toHaveCSS("padding-left", contract.table.cellPaddingInline);
  await expect(first.locator("td").first()).toHaveCSS("padding-top", contract.table.rowPaddingBlock);
  const name = first.locator('[class*="reportName"]');
  await expect(name).toHaveCSS("gap", contract.table.nameGap);
  await expect(name.locator("strong")).toHaveCSS("font-size", contract.table.nameSize);
  await expect(name.locator("strong")).toHaveCSS("font-weight", contract.table.nameWeight);
  const icon = name.locator('[class*="reportIcon"]');
  await expect(icon).toHaveCSS("width", contract.table.iconSize);
  await expect(icon).toHaveCSS("height", contract.table.iconSize);
  await expect(icon).toHaveCSS("border-radius", contract.table.iconRadius);
  await expect(icon.locator("svg")).toHaveAttribute("width", contract.table.svgSize);
  await expect(icon.locator("path")).toHaveCount(contract.table.dailyIconPaths.length);
  expect(await icon.locator("path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))))
    .toEqual([...contract.table.dailyIconPaths]);
  const monthly = rows.nth(2).locator('[class*="reportIcon"]');
  expect(await monthly.locator("path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))))
    .toEqual([...contract.table.monthlyIconPaths]);
  const reportsNav = page.locator('a[href="/reports"] svg');
  expect(await reportsNav.locator("path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))))
    .toEqual([...contract.table.dailyIconPaths]);
  const action = first.getByRole("button");
  await expect(action).toHaveCSS("padding-left", contract.table.actionPaddingInline);
  await expect(action).toHaveCSS("padding-top", contract.table.actionPaddingBlock);
  await expect(action).toHaveCSS("border-radius", contract.table.actionRadius);
  await expect(action).toHaveCSS("font-size", contract.table.actionSize);
  await expect(action).toHaveCSS("line-height", contract.table.actionLineHeight);
  await expect(action).toHaveCSS("font-weight", contract.table.actionWeight);
}

async function expectDialog(page: Page, dark: boolean) {
  const opener = page.getByRole("button", { name: /Preview Daily Report|معاينة التقرير اليومي/u });
  await opener.click();
  const dialog = page.getByRole("dialog");
  const backdrop = dialog.locator("..");
  await expect(backdrop).toHaveCSS("padding", contract.dialog.backdropPadding);
  await expect(backdrop).toHaveCSS("background-color", contract.dialog.backdrop);
  await expect(dialog).toHaveCSS("max-width", contract.dialog.maxWidth);
  await expect(dialog).toHaveCSS("border-radius", contract.dialog.radius);
  await expect(dialog).toHaveCSS(
    "background-color",
    dark ? contract.container.darkSurface : contract.container.lightSurface,
  );
  const header = dialog.locator("header");
  await expect(header).toHaveCSS("padding-top", contract.dialog.headerPaddingBlock);
  await expect(header).toHaveCSS("padding-left", contract.dialog.headerPaddingInline);
  await expect(header).toHaveCSS("display", contract.dialog.headerDisplay);
  await expect(header).toHaveCSS("justify-content", contract.dialog.headerJustify);
  const heading = header.getByRole("heading");
  await expect(heading).toHaveCSS("font-size", contract.dialog.titleSize);
  await expect(heading).toHaveCSS("line-height", contract.dialog.titleLineHeight);
  await expect(heading).toHaveCSS("font-weight", contract.dialog.titleWeight);
  const subtitle = header.locator("p");
  await expect(subtitle).toHaveCSS("font-size", contract.dialog.subtitleSize);
  await expect(subtitle).toHaveCSS("margin-top", contract.dialog.subtitleMarginTop);
  const close = dialog.getByRole("button", { name: /Close|إغلاق/u });
  await expect(close).toHaveCSS("padding", contract.dialog.closePadding);
  await expect(close).toHaveCSS("border-radius", contract.dialog.closeRadius);
  await expect(close).toHaveCSS("position", contract.dialog.closePosition);
  await expect(close.locator("svg")).toHaveAttribute("width", contract.dialog.closeSvg);
  await expect(close).toBeFocused();
  const body = dialog.locator('[class*="dialogBody"]');
  await expect(body).toHaveCSS("padding-left", contract.dialog.bodyPaddingInline);
  await expect(body).toHaveCSS("padding-top", contract.dialog.bodyPaddingBlock);
  const input = dialog.locator("input");
  await input.fill("2026-09-21");
  const load = dialog.getByRole("button", { name: /Load preview|تحميل المعاينة/u });
  await expectModalButton(load);
  await load.click();
  await expect(dialog.getByTestId("report-preview-content")).toBeVisible();
  const footer = dialog.getByTestId("report-export-region");
  await expect(footer).toHaveCSS("padding-left", contract.dialog.footerPaddingInline);
  await expect(footer).toHaveCSS("padding-top", contract.dialog.footerPaddingBlock);
  await expect(footer).toHaveCSS("gap", "12px");
  await expect(footer).toHaveCSS(
    "background-color",
    dark ? contract.dialog.footerDark : contract.dialog.footerLight,
  );
  const actions = footer.locator('[class*="exportActions"]');
  await expect(actions).toHaveCSS("gap", contract.dialog.footerGap);
  await expectModalButton(dialog.getByRole("button", { name: /Export CSV|تصدير CSV/u }));
  await expectModalButton(dialog.getByRole("button", { name: /Export PDF|تصدير PDF/u }));
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
}

async function expectModalButton(button: ReturnType<Page["getByRole"]>) {
  await expect(button).toHaveCSS("padding-left", contract.dialog.buttonPaddingInline);
  await expect(button).toHaveCSS("padding-top", contract.dialog.buttonPaddingBlock);
  await expect(button).toHaveCSS("border-radius", contract.dialog.buttonRadius);
  await expect(button).toHaveCSS("font-size", contract.dialog.buttonSize);
  await expect(button).toHaveCSS("line-height", contract.dialog.buttonLineHeight);
  await expect(button).toHaveCSS("font-weight", contract.dialog.buttonWeight);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.locator(".theme-segmented button").nth(theme === "light" ? 0 : 1).click();
}

export async function proveReportsReferenceGeometry(page: Page) {
  await enterReports(page);
  for (const locale of ["en", "ar"] as const) {
    if (locale === "ar") {
      await page.getByRole("button", { name: "Language" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    for (const narrow of [false, true]) {
      await page.setViewportSize({ width: narrow ? 480 : 1280, height: 900 });
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        const dark = theme === "dark";
        await expectPageGeometry(page, narrow, dark);
        await expectDialog(page, dark);
      }
    }
  }
}
