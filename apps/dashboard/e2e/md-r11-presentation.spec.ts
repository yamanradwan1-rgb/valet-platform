import { expect, test } from "@playwright/test";
import { enterR11, r11Base, r11Fixture } from "./support/md-r11-fixtures";
import { LOCATION_A } from "./support/dashboard-api-fixture";

test("R11 scope tabs use manual keyboard activation and only load the active scope", async ({
  page,
}) => {
  const { fixture } = r11Fixture();
  await fixture.install(page);
  await enterR11(page);
  const company = page.getByRole("tab", { name: "Company defaults" });
  const location = page.getByRole("tab", { name: "Location overrides" });
  await expect(page.locator('[data-setting="tipsEnabled"]')).toContainText(
    "Yes",
  );
  const initialReads = fixture.count(`${r11Base}/settings`);
  expect(initialReads).toBeLessThanOrEqual(2); // Development Strict Mode may mount twice.
  expect(
    fixture.count(`${r11Base}/locations/${LOCATION_A.locationId}/settings`),
  ).toBe(0);
  await company.focus();
  await page.keyboard.press("ArrowRight");
  await expect(location).toBeFocused();
  await expect(company).toHaveAttribute("aria-selected", "true");
  expect(
    fixture.count(`${r11Base}/locations/${LOCATION_A.locationId}/settings`),
  ).toBe(0);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "settings-tab-location",
  );
  await expect(page.locator('[data-setting="tipsEnabled"]')).toContainText(
    "Company defaults: Yes",
  );
  expect(
    fixture.count(`${r11Base}/locations/${LOCATION_A.locationId}/settings`),
  ).toBe(1);
  await page.keyboard.press("Home");
  await expect(company).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-setting="tipsEnabled"]')).not.toContainText(
    "Inherited",
  );
  expect(fixture.count(`${r11Base}/settings`)).toBe(initialReads + 1);
});

test("R11 Roles and Branding tabs preserve bounded read-only Users and keyboard semantics", async ({
  page,
}) => {
  const { fixture } = r11Fixture();
  await fixture.install(page);
  await enterR11(page, "/roles-permissions");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  expect(fixture.count(`${r11Base}/staff`)).toBe(0);
  await page.getByRole("tab").first().focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Space");
  await expect(page.getByText("worker@example.com")).toBeVisible();
  expect(fixture.count(`${r11Base}/staff`)).toBe(1);
  await expect(
    page.getByRole("button", {
      name: /Change role|Disable user|Grant Locations/,
    }),
  ).toHaveCount(0);
  await page.locator('nav a[href="/branding"]').click();
  await expect(page.getByLabel("Display name")).toHaveValue("VAYLET");
  await page.getByRole("tab").first().focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "branding-tab-location",
  );
  await expect(page.getByText("Inherited", { exact: true })).toHaveCount(2);
  expect(
    fixture.count(`${r11Base}/locations/${LOCATION_A.locationId}/branding`),
  ).toBe(1);
});

test("R11 Help is static, keyboard usable and requests no administration dataset", async ({
  page,
}) => {
  const { fixture } = r11Fixture();
  await fixture.install(page);
  await enterR11(page, "/help");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Help and product guidance",
  );
  const question = page.locator("summary").first();
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/Subscription shows the recorded plan and features/),
  ).toBeVisible();
  for (const suffix of ["settings", "branding", "integrations", "staff"])
    expect(fixture.count(`${r11Base}/${suffix}`)).toBe(0);
  await expect(
    page.getByText(
      /API Gateway|Active Node|Dispatch Ticket|Emergency.*Hotline/i,
    ),
  ).toHaveCount(0);
  await expect(
    page.locator('a[href^="mailto:"],a[href^="tel:"],form'),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Open account security" }).click();
  await expect(page).toHaveURL(/\/security$/);
  await expect(page.getByRole("status")).toContainText("Verified");
});
