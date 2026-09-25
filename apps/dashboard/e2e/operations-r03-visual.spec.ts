import { mkdirSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, stateCounts } from "./support/operations-fixtures";

const out = "C:/Temp/vaylet-md-r03/candidate";
const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;
const states = [
  "CHECKING_IN",
  "AWAITING_PARKING",
  "PARKING",
  "PARKED",
  "REQUESTED",
  "RETRIEVING",
  "READY",
  "HANDOFF_PENDING",
] as const;

function visualSessions() {
  return states.map((state, index) =>
    sessionItem({
      sessionId: `77777777-7777-4777-8777-7777777778${String(index).padStart(2, "0")}`,
      state,
      vehicle: {
        vehicleId: `88888888-8888-4888-8888-8888888888${String(index).padStart(2, "0")}`,
        plateCountry: "JO",
        plateNumberNormalized: `R03-${index + 1}`,
        temporaryDescriptor: null,
      },
    }),
  );
}

test("R03 visual proof covers EN/AR, light/dark, desktop/narrow without page overflow", async ({ page }) => {
  mkdirSync(out, { recursive: true });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${overview}/sessions`) {
        return { body: { items: visualSessions(), nextCursor: "visual_cursor_12345678" } };
      }
      if (path === `${overview}/session-state-counts`) return { body: stateCounts() };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const title = page.getByRole("heading", { name: "Live Operations", level: 1 });
  const firstCard = page.getByText("Active Sessions").locator("..").locator("..");
  const table = page.getByRole("table");
  await expect(title).toBeVisible();
  await expect(firstCard).toHaveCSS("height", "90px");
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveCSS("height", "30px");
  await expect(page.getByRole("columnheader", { name: "Vehicle" })).toHaveCSS("padding-top", "14px");
  await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCSS("text-align", "end");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.screenshot({ path: `${out}/en-light-desktop.png`, fullPage: true });

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(firstCard).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await expect(title).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.screenshot({ path: `${out}/en-dark-desktop.png`, fullPage: true });

  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "العمليات المباشرة", level: 1 })).toBeVisible();
  await expect(table.locator('bdi[dir="ltr"]').filter({ hasText: "R03-1" })).toBeVisible();
  await page.screenshot({ path: `${out}/ar-dark-desktop.png`, fullPage: true });

  await page.getByRole("button", { name: "فاتح" }).click();
  await page.screenshot({ path: `${out}/ar-light-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.locator('[class*="metricGrid"]')).toHaveCSS("grid-template-columns", /[0-9.]+px/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(480);
  const tableWrap = table.locator("..");
  expect(await tableWrap.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await page.screenshot({ path: `${out}/ar-light-narrow.png`, fullPage: true });

  const details = page.getByRole("button", { name: /التفاصيل/u }).first();
  await details.click();
  const dialog = page.getByRole("dialog", { name: "التفاصيل" });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.width).toBeLessThanOrEqual(480);
  await page.screenshot({ path: `${out}/ar-light-narrow-details.png`, fullPage: true });
});
