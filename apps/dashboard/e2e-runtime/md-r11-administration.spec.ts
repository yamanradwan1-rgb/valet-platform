import { expect, test } from "./support/runtime-test";
import {
  assurePreEnrolled,
  runtimeFixture as f,
  selectLocation,
  signIn,
} from "./support/runtime-fixture";

test("R11 real Company settings, inherited Location values, Branding and read-only administration", async ({
  page,
}) => {
  await signIn(page, f.emails.conflictAdmin);
  await assurePreEnrolled(page);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await page.locator('nav a[href="/policies"]').click();
  const row = page.locator('[data-setting="tipsEnabled"]');
  await expect(row).toBeVisible();
  const original = await row.locator("select").inputValue();
  await row
    .locator("select")
    .selectOption(original === "true" ? "false" : "true");
  const companyWrite = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" && r.url().endsWith("/settings/default"),
  );
  await row.getByRole("button", { name: "Save", exact: true }).click();
  expect((await companyWrite).status()).toBe(200);
  await expect(
    row.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Location overrides" }).click();
  await expect(row).toContainText("Inherited");
  const current = await row.locator("select").inputValue();
  await row
    .locator("select")
    .selectOption(current === "true" ? "false" : "true");
  const locationWrite = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" && r.url().endsWith("/settings/override"),
  );
  await row.getByRole("button", { name: "Save", exact: true }).click();
  expect((await locationWrite).status()).toBe(200);
  await expect(row).toContainText("Overridden");
  await row.getByRole("button", { name: "Clear override" }).click();
  await expect(row).toContainText("Inherited");
  const sla = page.locator('[data-setting="slaTargetSeconds"]');
  await sla.locator("input").fill("29");
  await expect(
    sla.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await sla.locator("input").fill("180");
  await sla.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    sla.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await sla.getByRole("button", { name: "Clear override" }).click();
  await expect(sla.locator("input")).toHaveValue("");
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
  await page.getByRole("tab", { name: "Users" }).click();
  await expect(page.locator("tbody")).toContainText(f.emails.locationManager);
  await page.locator('nav a[href="/integrations"]').click();
  await expect(page.locator('[class*="integrationCard"]')).toHaveCount(3);
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
  await expect(page.getByRole("tab")).toHaveCount(0);
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
