import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  runtimeFixture as f,
  selectLocation,
  signIn,
} from "./support/runtime-fixture";

test("R11 real Studio Company defaults, Location overrides, Branding and read-only administration", async ({
  page,
}) => {
  await signIn(page, f.emails.conflictAdmin);
  await assurePreEnrolled(page);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await page.locator('nav a[href="/policies"]').click();
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await page.getByRole("button", { name: "Company defaults" }).click();
  await page.locator('.ps-section-links a[href*="section=payments"]').click();
  const row = page.locator('[data-setting="tipsEnabled"]');
  await expect(row).toBeVisible();
  await row.locator(".ps-edit-button").click();
  const original = await row.locator("select").inputValue();
  await row
    .locator("select")
    .selectOption(original === "true" ? "false" : "true");
  const companyWrite = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" && r.url().endsWith("/settings/default"),
  );
  await row.locator('button[type="submit"]').click();
  expect((await companyWrite).status()).toBe(200);
  await expect(row.locator(".ps-edit-button")).toBeVisible();
  await page.getByRole("button", { name: "Location overrides" }).click();
  await expect(row).toContainText("Inherited");
  await row.locator(".ps-edit-button").click();
  const current = await row.locator("select").inputValue();
  await row
    .locator("select")
    .selectOption(current === "true" ? "false" : "true");
  const locationWrite = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" && r.url().endsWith("/settings/override"),
  );
  await row.locator('button[type="submit"]').click();
  expect((await locationWrite).status()).toBe(200);
  await expect(row).toContainText("Overridden");
  await row.locator(".ps-edit-button").click();
  await row.getByRole("button", { name: "Clear Override" }).click();
  await expect(row).toContainText("Inherited");
  await page.locator('nav a[href="/branding"]').click();
  await expect(
    page.getByRole("heading", { name: "Branding", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Location branding" }).click();
  await expect(page.getByText("Inherited", { exact: true })).toHaveCount(2);
  await page.getByLabel("Primary color").fill("#126ABC");
  await page.getByRole("button", { name: "Save Primary color" }).click();
  await expect(page.getByText("Overridden", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Clear override" }).nth(1).click();
  await expect(page.getByText("Inherited", { exact: true })).toHaveCount(2);
  await page.locator('nav a[href="/roles-permissions"]').click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  // Roles & Permissions is intentionally a read-only reference. Staff
  // assignments and the directory are in the separate Employees route.
  await page.locator('nav a[href="/employees"]').click();
  await expect(
    page.getByRole("heading", { name: "Employees & Shifts" }),
  ).toBeVisible();
  await expect(page.locator("tbody")).toContainText(f.emails.locationManager);
  // The Owner retired Service Status from every Dashboard UI surface.
  await page.goto("/integrations");
  await expect(page).toHaveURL(/\/policies$/u);
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Service Status" })).toHaveCount(
    0,
  );
  await page.locator('nav a[href="/billing-subscription"]').click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.locator('nav a[href="/help"]').click();
  await expect(page.locator("details")).toHaveCount(4);
});

test("R11 real Location Manager retains narrow settings and exact Location Branding", async ({
  page,
}) => {
  await signIn(page, f.emails.locationManager);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await page.locator('nav a[href="/policies"]').click();
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.locator(".ps-scope-switch button")).toHaveCount(1);
  await page.locator('.ps-section-links a[href*="section=payments"]').click();
  await expect(page.locator('[data-setting="tipsEnabled"]')).toBeVisible();
  for (const key of [
    "slaTargetSeconds",
    "ocrAssistEnabled",
    "operatingHours",
    "parkingSpotRequired",
    "guestVehicleReadyNotificationEnabled",
  ])
    await expect(page.locator(`[data-setting="${key}"]`)).toHaveCount(0);
  await page.locator('nav a[href="/branding"]').click();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByText("Inherited", { exact: true })).toHaveCount(2);
  await expect(
    page.locator(
      'nav a[href="/roles-permissions"],nav a[href="/integrations"]',
    ),
  ).toHaveCount(0);
});
