import playwrightTest from "../../../apps/dashboard/node_modules/@playwright/test/index.js";

const { expect, test } = playwrightTest;

test("forbidden section links normalize for every variant and readonly role", async ({ page }) => {
  for (const variant of ["a", "b", "c", "d"]) {
    await page.goto(`/${variant}?section=company&scenario=location-manager-read-only&lang=en&theme=light`);
    await expect(page).toHaveURL(/section=location&scenario=location-manager-read-only/);
    await expect(page.locator("#p321-current-section")).toHaveText("Location Overrides");
    await page.getByTestId("scenario").selectOption("denied");
    await expect(page).toHaveURL(/section=overview&scenario=denied/);
    await expect(page.locator(".p321-setting-row")).toHaveCount(0);
    await page.getByTestId("scenario").selectOption("location-manager");
    await expect(page).toHaveURL(/section=location&scenario=location-manager/);
    await expect(page.locator("#p321-current-section")).toHaveText("Location Overrides");
  }
});

test("option B collapsed navigation retains its ARIA controlled element", async ({ page }) => {
  await page.goto("/b?section=company&scenario=company-with-location&lang=en&theme=light");
  const toggle = page.getByRole("button", { name: "Information & reference" });
  const list = page.locator("#p321-b-information");
  await expect(toggle).toHaveAttribute("aria-controls", "p321-b-information");
  await expect(list).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(list).toHaveAttribute("hidden", "");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(list).toBeVisible();
});
