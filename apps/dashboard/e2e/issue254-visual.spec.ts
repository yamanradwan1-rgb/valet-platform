import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { Issue232PhysicalState } from "./support/issue232-physical-resources";
import { enterKeysSpots, openPhysicalResources } from "./support/keys-spots";
import { operationsReadReply } from "./support/operations-fixtures";
import { keyPage, resourcePath, spotPage } from "./support/issue254-resources";

const output =
  process.env.ISSUE254_VISUAL_DIR ?? join(tmpdir(), "vaylet-issue254-visual");

test("frozen Keys & Spots composition in EN/AR, light/dark, desktop/narrow", async ({
  page,
}) => {
  const state = new Issue232PhysicalState(true);
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === resourcePath("keys")) return { body: keyPage() };
      if (path === resourcePath("spots")) return { body: spotPage() };
      return state.reply(path, request) ?? operationsReadReply(path);
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterKeysSpots(page);
  mkdirSync(output, { recursive: true });
  for (const variant of [
    "en-light",
    "en-dark",
    "ar-dark",
    "ar-light",
    "ar-narrow",
  ]) {
    if (variant === "en-dark")
      await page.getByRole("button", { name: "Dark", exact: true }).click();
    if (variant === "ar-dark")
      await page.getByRole("button", { name: "Language", exact: true }).click();
    if (variant === "ar-light")
      await page.getByRole("button", { name: "فاتح", exact: true }).click();
    if (variant === "ar-narrow")
      await page.setViewportSize({ width: 480, height: 900 });
    const arabic = variant.startsWith("ar");
    await page
      .getByRole("tab", {
        name: arabic ? "المفاتيح التشغيلية" : "Operational Keys",
        exact: true,
      })
      .click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveCount(5);
    await expect(page.getByText("12345", { exact: true })).toHaveAttribute(
      "dir",
      "ltr",
    );
    await expect(
      page.getByText("سيارة زرقاء Blue", { exact: true }),
    ).toHaveAttribute("dir", "auto");
    await page.evaluate(async () => document.fonts.ready);
    await page.screenshot({
      path: join(output, `${variant}-keys.png`),
      fullPage: true,
    });
    if (!arabic) await openPhysicalResources(page);
    else
      await page
        .getByRole("tab", { name: "الموارد المادية", exact: true })
        .click();
    await page
      .getByRole("tab", {
        name: arabic ? "مواقف السيارات" : "Parking Spots",
        exact: true,
      })
      .click();
    await expect(page.getByText("P-1", { exact: true })).toBeVisible();
    await expect(
      page.getByText(arabic ? "مشغول" : "Occupied", { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText(arabic ? "متاح" : "Available", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveCount(5);
    await expect(page.getByTestId("physical-resources-surface")).toHaveCSS(
      "border-radius",
      "12px",
    );
    await page.screenshot({
      path: join(output, `${variant}-spots.png`),
      fullPage: true,
    });
    if (variant === "ar-narrow") {
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(480);
    }
  }
});
