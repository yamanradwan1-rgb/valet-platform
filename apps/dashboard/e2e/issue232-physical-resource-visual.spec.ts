import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { Issue232PhysicalState } from "./support/issue232-physical-resources";
import { enterPhysicalResources } from "./support/keys-spots";

const output = join(process.cwd(), "test-results", "issue232-visual");

async function settled(page: Page) {
  await page.evaluate(async () => document.fonts.ready);
  await page.getByTestId("md03-page").evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((item) => item.finished),
    );
  });
}

async function screenshot(page: Page, name: string) {
  mkdirSync(output, { recursive: true });
  await settled(page);
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
}

async function install(page: Page, state: Issue232PhysicalState) {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => state.reply(path, request),
  });
  await fixture.install(page);
  await enterPhysicalResources(page);
}

test("Issue #232 follows native Locations visual language across theme, RTL and narrow layouts", async ({
  page,
}) => {
  const state = new Issue232PhysicalState(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await install(page, state);
  const panel = page.getByTestId("physical-resources-panel");
  const surface = page.getByTestId("physical-resources-surface");
  await expect(surface).toHaveCSS("border-radius", "12px");
  await expect(surface.getByRole("table")).toBeVisible();
  await expect(surface.getByText("K-01", { exact: true })).toHaveAttribute(
    "dir",
    "ltr",
  );
  mkdirSync(output, { recursive: true });
  await panel.screenshot({
    path: join(output, "panel-en-light-key-slots.png"),
  });
  await screenshot(page, "en-light-populated");

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(surface).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await screenshot(page, "en-dark-populated");

  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(surface.getByText("K-01", { exact: true })).toHaveAttribute(
    "dir",
    "ltr",
  );
  await screenshot(page, "ar-rtl-desktop");

  await page.getByRole("button", { name: "داكن", exact: true }).click();
  await expect(surface).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await page.setViewportSize({ width: 480, height: 900 });
  await settled(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(480);
  await screenshot(page, "ar-rtl-narrow");

  await page.getByRole("button", { name: "إضافة خانة مفتاح" }).click();
  const arabicCreate = page.getByRole("dialog", { name: "إضافة خانة مفتاح" });
  expect((await arabicCreate.boundingBox())!.width).toBeLessThanOrEqual(448);
  await expect(arabicCreate.getByLabel("الرمز")).toBeFocused();
  await screenshot(page, "ar-narrow-create-dialog");
  await arabicCreate.press("Escape");
  await page.getByRole("button", { name: "عرض الملصق" }).first().click();
  const arabicLabel = page.getByRole("dialog", { name: "ملصق مورد مادي" });
  await expect(arabicLabel).toBeVisible();
  await screenshot(page, "ar-dark-narrow-qr-label");
  await arabicLabel.press("Escape");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "اللغة", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const conflict = page.getByRole("dialog", { name: "Add Key Slot" });
  await conflict.getByLabel("Code").fill("K-01");
  await conflict.getByRole("button", { name: "Create", exact: true }).click();
  await expect(conflict.getByRole("alert")).toBeVisible();
  await screenshot(page, "en-validation-conflict");
  await conflict.press("Escape");

  await page.getByRole("button", { name: "View label" }).first().click();
  const label = page.getByRole("dialog", { name: "Physical resource label" });
  expect((await label.boundingBox())!.width).toBeLessThanOrEqual(560);
  await expect(label.getByText("KEY SLOT", { exact: true })).toBeVisible();
  await screenshot(page, "en-qr-label-dialog");
  await label.press("Escape");
  await page.getByRole("tab", { name: "Parking Spots" }).click();
  await expect(surface.getByText("P-01", { exact: true })).toBeVisible();
  await panel.screenshot({
    path: join(output, "panel-en-light-parking-spots.png"),
  });
});

test("empty physical-resource state preserves the frozen panel geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await install(page, new Issue232PhysicalState(false));
  await expect(
    page.getByText("No Key Slots configured for this Location."),
  ).toBeVisible();
  await expect(page.getByTestId("physical-resources-surface")).toHaveCSS(
    "border-radius",
    "12px",
  );
  await screenshot(page, "en-light-empty");
});
