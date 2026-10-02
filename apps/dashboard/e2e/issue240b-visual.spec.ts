import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  STAFF_EMAIL,
  staffDetail,
  staffItem,
  staffPath,
} from "./support/administration-r05-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { historyPath, historyRow } from "./support/issue240e-history";

const phase = process.env.T05B_VISUAL_PHASE ?? "after";
const out = join(tmpdir(), "vaylet-t05b", phase);
const directory = staffPath(ORG_A.organizationId);
const detail = `${directory}/${staffItem().membershipId}`;
const grants = `${detail}/location-access`;
const candidates = `${grants}/candidates`;

function grant(location = LOCATION_A) {
  return {
    code: location.code,
    locationId: location.locationId,
    name: location.name,
    status: location.status,
  };
}

async function settle(page: Page) {
  await page.evaluate(async () => document.fonts.ready);
  await page.getByTestId("md02-page").evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
}

function visualFixture(authority: "CA" | "LM") {
  return new DashboardApiFixture({
    ...(authority === "CA"
      ? {
          companyOrganizations: [ORG_A],
          companyLocations: {
            [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
          },
        }
      : {
          locationManagerOrganizations: [ORG_A],
          locationManagerLocations: {
            [ORG_A.organizationId]: [LOCATION_A, LOCATION_B],
          },
        }),
    override: (path, request) => {
      if (path === directory)
        return { body: { items: [staffItem()], nextCursor: null } };
      if (path === detail) return { body: staffDetail() };
      if (path === grants && request.method() === "GET")
        return { body: { items: [grant()], nextCursor: null } };
      if (path === candidates && request.method() === "GET")
        return {
          body: {
            items: [
              { ...grant(LOCATION_A), granted: true },
              { ...grant(LOCATION_B), granted: false },
            ],
            nextCursor: null,
          },
        };
      if (path === historyPath())
        return {
          body: {
            items: [historyRow({ identity: staffItem().identity })],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
}

async function enterEmployees(page: Page, authority: "CA" | "LM") {
  await page.goto("/employees");
  await signInOnCurrentPage(
    page,
    authority === "CA" ? undefined : "manager@example.com",
  );
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", {
      name: authority === "CA" ? "All Locations" : LOCATION_A.name,
      exact: true,
    })
    .click();
  if (authority === "LM")
    await page.getByRole("button", { name: "Employees", exact: true }).click();
  await expect(page.getByText(STAFF_EMAIL, { exact: true })).toBeVisible();
  await settle(page);
}

test("T05-B CA visual freeze and Shifts table proof", async ({ page }) => {
  mkdirSync(out, { recursive: true });
  const fixture = visualFixture("CA");
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterEmployees(page, "CA");
  const geometry: Record<string, unknown> = {};
  const table = page.getByRole("table");
  const row = await table.getByRole("row").nth(1).boundingBox();
  expect(row?.height).toBeCloseTo(69, 1);
  geometry.desktopTable = await table.boundingBox();
  await page.screenshot({
    path: join(out, "ca-en-light-desktop-table.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog");
  const drawerBox = await drawer.boundingBox();
  expect(drawerBox?.width).toBeCloseTo(448, 1);
  geometry.desktopDrawer = drawerBox;
  await page.screenshot({
    path: join(out, "ca-en-light-desktop-drawer.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  await page.screenshot({
    path: join(out, "ca-ar-dark-narrow-table.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: `التفاصيل: ${STAFF_EMAIL}` }).click();
  geometry.narrowDrawer = await page.getByRole("dialog").boundingBox();
  await page.screenshot({
    path: join(out, "ca-ar-dark-narrow-drawer.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "اللغة", exact: true }).click();
  await page
    .getByRole("group", { name: "Theme" })
    .getByRole("button")
    .nth(0)
    .click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".sidebar-scope").click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("button", { name: "Shifts", exact: true }).click();
  const shiftTable = page.getByRole("table");
  await expect(
    shiftTable.getByText(STAFF_EMAIL, { exact: true }).first(),
  ).toBeVisible();
  await shiftTable.screenshot({ path: join(out, "shifts-table.png") });
  writeFileSync(
    join(out, "ca-geometry.json"),
    JSON.stringify(geometry, null, 2),
  );
});

test("T05-B LM touched visual surfaces", async ({ page }) => {
  test.skip(phase === "baseline", "LM Employees is introduced by T05-B.");
  mkdirSync(out, { recursive: true });
  const fixture = visualFixture("LM");
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterEmployees(page, "LM");
  await page.screenshot({
    path: join(out, "lm-en-light-desktop-table.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: `Details: ${STAFF_EMAIL}` }).click();
  const drawer = page.getByRole("dialog");
  expect((await drawer.boundingBox())?.width).toBeCloseTo(448, 1);
  await page.screenshot({
    path: join(out, "lm-en-light-desktop-drawer.png"),
    fullPage: true,
  });
  await drawer
    .getByRole("button", { name: "Grant selected Locations" })
    .click();
  await page.screenshot({
    path: join(out, "lm-en-light-desktop-dialog.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    480,
  );
  await page.getByRole("button", { name: `التفاصيل: ${STAFF_EMAIL}` }).click();
  await page.screenshot({
    path: join(out, "lm-ar-dark-narrow-drawer.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "منح صلاحية المواقع المحددة" })
    .click();
  await page.screenshot({
    path: join(out, "lm-ar-dark-narrow-dialog.png"),
    fullPage: true,
  });
});
