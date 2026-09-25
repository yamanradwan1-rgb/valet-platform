import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { sessionItem, taskItem } from "./support/operations-fixtures";

const out = join(tmpdir(), "vaylet-md-r04", "candidate");
const overview = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/overview`;

function vehicleRows() {
  return ["PARKED", "REQUESTED", "PARKING", "READY"] as const;
}

function visualVehicles() {
  return vehicleRows().map((state, index) => sessionItem({
    sessionId: `77777777-7777-4777-8777-7777777779${String(index).padStart(2, "0")}`,
    state,
    vehicle: {
      vehicleId: `88888888-8888-4888-8888-8888888889${String(index).padStart(2, "0")}`,
      plateCountry: "JO",
      plateNumberNormalized: index === 1 ? null : `R04-${index + 1}`,
      temporaryDescriptor: index === 1 ? "Blue SUV near gate" : null,
    },
  }));
}

function visualTasks() {
  const statuses = ["QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
  return statuses.map((status, index) => taskItem({
    taskId: `99999999-9999-4999-8999-9999999999${String(index).padStart(2, "0")}`,
    taskType: index % 2 === 0 ? "PARKING" : "RETRIEVAL",
    status,
    currentAssigneeMembershipId: index % 2 === 0 ? null : "55555555-5555-4555-8555-555555555555",
  }));
}

test("R04 visual proof covers Vehicles and Tasks in light/dark, EN/AR, desktop/narrow", async ({ page }) => {
  mkdirSync(out, { recursive: true });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => {
      if (path === `${overview}/sessions`) return { body: { items: visualVehicles(), nextCursor: "visual_vehicle_cursor_12345678" } };
      if (path === `${overview}/tasks`) return { body: { items: visualTasks(), nextCursor: "visual_task_cursor_12345678" } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/vehicles");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const vehicleTable = page.getByRole("table");
  await expect(page.getByRole("heading", { name: "Vehicles", level: 1 })).toHaveCSS("font-size", "24px");
  await expect(page.getByRole("searchbox")).toHaveCSS("min-height", "42px");
  await expect(page.getByRole("combobox", { name: "State" })).toHaveCSS("min-height", "38px");
  const vehicleHeaderBox = await vehicleTable.getByRole("columnheader", { name: "Vehicle" }).boundingBox();
  expect(vehicleHeaderBox?.height).toBeGreaterThanOrEqual(44);
  expect(vehicleHeaderBox?.height).toBeLessThanOrEqual(45);
  const vehicleRow = vehicleTable.getByRole("row").nth(1);
  const vehicleRowBox = await vehicleRow.boundingBox();
  expect(vehicleRowBox?.height).toBeGreaterThanOrEqual(64);
  expect(vehicleRowBox?.height).toBeLessThanOrEqual(67);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.screenshot({ path: join(out, "vehicles-en-light-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator('[class*="tableCard"]')).toHaveCSS("background-color", "rgb(13, 21, 47)");
  await page.screenshot({ path: join(out, "vehicles-en-dark-desktop.png"), fullPage: true });

  await page.getByRole("navigation", { name: "Management navigation" })
    .getByRole("link", { name: "Tasks" }).click();
  const taskTable = page.getByRole("table");
  const taskHeaderBox = await taskTable.getByRole("columnheader", { name: "Type" }).boundingBox();
  expect(taskHeaderBox?.height).toBeGreaterThanOrEqual(44);
  expect(taskHeaderBox?.height).toBeLessThanOrEqual(45);
  await expect(taskTable.getByRole("columnheader", { name: "Actions" })).toHaveCSS("text-align", "end");
  await page.screenshot({ path: join(out, "tasks-en-dark-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "المهام", level: 1 })).toBeVisible();
  await expect(taskTable.getByText("اصطفاف", { exact: true }).first()).toBeVisible();
  await expect(taskTable.getByText("استرجاع", { exact: true }).first()).toBeVisible();
  await expect(taskTable.locator('bdi[dir="ltr"]').filter({ hasText: LOCATION_A.code }).first()).toBeVisible();
  await page.screenshot({ path: join(out, "tasks-ar-dark-desktop.png"), fullPage: true });

  await page.getByRole("button", { name: "فاتح" }).click();
  await page.screenshot({ path: join(out, "tasks-ar-light-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: "المركبات" }).click();
  await page.screenshot({ path: join(out, "vehicles-ar-light-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 480, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(480);
  await page.screenshot({ path: join(out, "vehicles-ar-light-narrow.png"), fullPage: true });
  const details = page.getByRole("button", { name: /التفاصيل/u }).first();
  await details.scrollIntoViewIfNeeded();
  await expect(details).toBeVisible();
  await details.click();
  const dialog = page.getByRole("dialog", { name: "التفاصيل" });
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.width).toBeLessThanOrEqual(480);
  expect(dialogBox?.x).toBeLessThan(8);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "المهام" }).click();
  await page.setViewportSize({ width: 480, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(480);
  await page.getByRole("table").getByRole("button", { name: /التفاصيل/u }).first().scrollIntoViewIfNeeded();
  await expect(page.getByRole("table").getByRole("button", { name: /التفاصيل/u }).first()).toBeVisible();
  await page.screenshot({ path: join(out, "tasks-ar-light-narrow.png"), fullPage: true });
});
