import { expect, test } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { areaItem, operationsReadReply, pointItem } from "./support/operations-fixtures";

const pointsPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/points`;
const areasPath = `/v1/staff/locations/${LOCATION_A.locationId}/map/areas`;

test("MD-03 six pages preserve the frozen reference hierarchy, geometry, and dark palette", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => operationsReadReply(path),
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const title = page.getByRole("heading", { name: "Live Operations", level: 1 });
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("font-weight", "700");
  await expect(page.getByText("Real-time operational context")).toHaveCSS("font-size", "14px");
  await expect(page.getByText("Real-time operational context")).toHaveCSS("line-height", "20px");
  const activeCard = page.getByText("Active Sessions").locator("..").locator("..");
  await expect(activeCard).toHaveCSS("border-radius", "12px");
  await expect(activeCard.locator("div").first()).toHaveCSS("width", "48px");
  const liveHeader = page.getByRole("columnheader", { name: "Vehicle" });
  await expect(liveHeader).toHaveCSS("padding-top", "14px");
  await expect(liveHeader).toHaveCSS("padding-left", "24px");
  await expect(liveHeader).toHaveCSS("font-weight", "600");
  await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCSS("text-align", "end");
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  const titleBox = await title.boundingBox();
  const activeBox = await activeCard.boundingBox();
  const allBox = await page.getByRole("button", { name: "All", exact: true }).boundingBox();
  const headerBox = await liveHeader.boundingBox();
  const rowBox = await page.locator("tbody tr").first().boundingBox();
  expect(titleBox?.x).toBeCloseTo(292, 0);
  expect(titleBox?.y).toBeCloseTo(96, 0);
  expect(activeBox?.height).toBeCloseTo(90, 0);
  expect(activeBox?.width).toBeCloseTo(265.5, 0);
  expect(allBox?.y).toBeCloseTo(290, 0);
  expect(allBox?.height).toBeCloseTo(30, 0);
  expect(headerBox?.y).toBeCloseTo(346, 0);
  expect(headerBox?.height).toBeCloseTo(44.5, 0);
  expect(rowBox?.height).toBeCloseTo(68.5, 0);
  const metricGrid = activeCard.locator("..");
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(async () => (await metricGrid.evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(" ").length
  ))).toBe(2);
  await page.setViewportSize({ width: 1280, height: 900 });

  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await nav.getByRole("link", { name: "Vehicles" }).click();
  await expect(page.getByRole("heading", { name: "Vehicles", level: 1 })).toHaveCSS("font-size", "24px");
  const vehicleHeader = page.getByRole("columnheader", { name: "Vehicle" });
  await expect(vehicleHeader).toHaveCSS("padding-left", "24px");
  await expect(vehicleHeader).toHaveCSS("background-color", "rgb(250, 251, 253)");
  await expect(page.getByRole("searchbox")).toHaveCSS("min-height", "42px");
  await expect(page.getByRole("combobox", { name: "State" })).toHaveCSS("min-height", "38px");
  await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCSS("text-align", "end");

  await nav.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toHaveCSS("font-weight", "700");
  await expect(page.getByRole("columnheader", { name: "Type" })).toHaveCSS("padding-left", "24px");
  await expect(page.getByRole("combobox", { name: "State" })).toHaveCSS("min-height", "38px");
  await expect(page.getByRole("combobox", { name: "Type" })).toHaveCSS("min-height", "38px");

  await nav.getByRole("link", { name: "Keys" }).click();
  await expect(page.getByRole("heading", { name: "Keys", level: 1 })).toHaveCSS("font-size", "24px");
  await expect(page.locator('[class*="filterPlaceholder"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Previous" })).toHaveCSS("width", "32px");
  await expect(page.getByRole("button", { name: "Previous" })).toHaveCSS("height", "32px");

  await nav.getByRole("link", { name: "Incidents" }).click();
  await expect(page.getByRole("heading", { name: "Incidents", level: 1 })).toHaveCSS("font-weight", "700");
  const incidentHeader = page.getByRole("columnheader", { name: "Description" });
  await expect(incidentHeader).toHaveCSS("padding-top", "14px");
  await expect(incidentHeader).toHaveCSS("padding-left", "20px");
  await expect(page.locator('[class*="incidentFilterPlaceholder"]')).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Previous" })).toHaveCSS("width", "28px");

  await nav.getByRole("link", { name: "Maps & Zones" }).click();
  await expect(page.getByRole("heading", { name: "Maps & Zones", level: 1 })).toHaveCSS("font-size", "24px");
  await expect(page.getByTestId("md03-page")).toHaveCSS("row-gap", "20px");
  const canvas = page.getByTestId("coordinate-canvas");
  await expect(canvas).toHaveCSS("min-height", "510px");
  await expect(canvas).toHaveCSS("border-radius", "0px");
  await expect(canvas.locator("svg")).toHaveCSS("height", "510px");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(title).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Maps & Zones", level: 1 })).toHaveCSS("color", "rgb(255, 255, 255)");
  const mapToolbar = page.getByTestId("map-reference-toolbar");
  await expect(mapToolbar).toHaveCSS("background-color", "rgb(14, 22, 49)");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "الخرائط والمناطق", level: 1 })).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
});

test("Map Setup dialogs preserve the frozen Maps modal composition", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === pointsPath) return { body: { points: [pointItem()] } };
      if (path === areasPath) return { body: { areas: [areaItem()] } };
      return operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await page.goto("/maps-zones");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Setup / Operational Areas" }).click();

  const opener = page.getByRole("button", { name: "Add Point" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Add Point" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(dialog).toHaveCSS("border-radius", "12px");
  await expect(dialog).toHaveCSS("border-color", "rgb(226, 232, 240)");
  const header = dialog.locator("header");
  const body = dialog.locator('[class*="mapDialogBody"]');
  const footer = dialog.locator("footer");
  await expect(header).toHaveCSS("padding-left", "24px");
  await expect(header).toHaveCSS("padding-top", "16px");
  await expect(body).toHaveCSS("padding-left", "24px");
  await expect(body).toHaveCSS("padding-top", "20px");
  await expect(footer).toHaveCSS("background-color", "rgb(250, 251, 253)");
  await expect(footer).toHaveCSS("padding-left", "24px");
  const codeLabel = dialog.getByText("Code", { exact: true });
  await expect(codeLabel).toHaveCSS("font-size", "12px");
  await expect(codeLabel).toHaveCSS("font-weight", "500");
  await expect(codeLabel).toHaveCSS("color", "rgb(51, 65, 85)");
  const codeInput = codeLabel.locator("..").getByRole("textbox");
  await expect(codeInput).toHaveCSS("border-radius", "8px");
  await expect(codeInput).toHaveCSS("font-size", "14px");
  await expect(codeInput).toHaveCSS("padding-left", "12px");
  await expect(codeInput).toHaveCSS("padding-top", "8px");
  await expect(codeInput).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(codeInput).toHaveCSS("border-color", "rgb(226, 232, 240)");
  await codeInput.focus();
  await expect(codeInput).toHaveCSS("border-color", "rgb(30, 96, 240)");
  await expect(codeInput).toHaveCSS("box-shadow", "rgb(30, 96, 240) 0px 0px 0px 1px");

  const kindField = dialog.getByText("Kind", { exact: true }).locator("..");
  const kindSelect = kindField.getByRole("combobox");
  const kindChevron = kindField.getByTestId("map-setup-select-chevron");
  await expect(kindSelect).toHaveCSS("appearance", "none");
  await expect(kindSelect).toHaveCSS("border-radius", "8px");
  await expect(kindSelect).toHaveCSS("font-size", "14px");
  await expect(kindSelect).toHaveCSS("font-weight", "500");
  await expect(kindSelect).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(kindSelect).toHaveCSS("border-color", "rgb(226, 232, 240)");
  await expect(kindSelect).toHaveCSS("padding-left", "14px");
  await expect(kindSelect).toHaveCSS("padding-right", "32px");
  await expect(kindChevron).toHaveCSS("pointer-events", "none");
  await expect(kindChevron.locator("svg")).toHaveAttribute("width", "16");
  await kindSelect.focus();
  await expect(kindSelect).toHaveCSS("border-color", "rgb(30, 96, 240)");
  await expect(kindSelect).toHaveCSS("box-shadow", "rgb(30, 96, 240) 0px 0px 0px 1px");

  const save = dialog.getByRole("button", { name: "Save" });
  await expect(save).toHaveCSS("font-size", "14px");
  await expect(save).toHaveCSS("background-color", "rgb(30, 96, 240)");
  await save.hover();
  await expect(save).toHaveCSS("background-color", "rgb(21, 81, 202)");
  await save.focus();
  await expect(save).toHaveCSS("box-shadow", /rgb\(30, 96, 240\)/u);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.getByRole("button", { name: "Add Area" }).click();
  await expect(page.getByRole("dialog", { name: "Add Area" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Edit boundary/u }).click();
  await expect(page.getByRole("dialog", { name: "Edit boundary" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Dark" }).click();
  await opener.click();
  const darkDialog = page.getByRole("dialog", { name: "Add Point" });
  await expect(darkDialog).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await expect(darkDialog.locator("footer")).toHaveCSS("background-color", "rgb(9, 16, 36)");
  const darkCodeInput = darkDialog.getByText("Code", { exact: true }).locator("..").getByRole("textbox");
  const darkKindSelect = darkDialog.getByText("Kind", { exact: true }).locator("..").getByRole("combobox");
  await expect(darkCodeInput).toHaveCSS("background-color", "rgb(19, 30, 61)");
  await expect(darkCodeInput).toHaveCSS("border-color", "rgb(30, 41, 59)");
  await expect(darkCodeInput).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(darkKindSelect).toHaveCSS("background-color", "rgb(19, 30, 61)");
  await expect(darkKindSelect).toHaveCSS("border-color", "rgb(30, 41, 59)");
  await expect(darkKindSelect).toHaveCSS("color", "rgb(226, 232, 240)");
  const cancel = darkDialog.getByRole("button", { name: "Cancel" });
  await cancel.hover();
  await expect(cancel).toHaveCSS("background-color", "rgb(26, 38, 79)");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("button", { name: "إضافة نقطة" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const rtlDialog = page.getByRole("dialog", { name: "إضافة نقطة" });
  await expect(rtlDialog).toBeVisible();
  const rtlKindField = rtlDialog.getByText("النوع", { exact: true }).locator("..");
  const rtlSelect = rtlKindField.getByRole("combobox");
  const rtlChevron = rtlKindField.getByTestId("map-setup-select-chevron");
  await expect(rtlSelect).toHaveCSS("padding-left", "32px");
  await expect(rtlSelect).toHaveCSS("padding-right", "14px");
  const selectBox = await rtlSelect.boundingBox();
  const chevronBox = await rtlChevron.boundingBox();
  expect(selectBox).not.toBeNull();
  expect(chevronBox).not.toBeNull();
  expect(chevronBox!.x).toBeLessThan(selectBox!.x + selectBox!.width / 2);
});
