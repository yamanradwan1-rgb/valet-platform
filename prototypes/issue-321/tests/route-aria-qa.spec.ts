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

test("option D removes Service Status from navigation, URL and option switching", async ({ page }) => {
  await page.goto("/d?section=services&scenario=company-with-location&lang=en&theme=light");
  await expect(page).toHaveURL(/\/d\?section=company&/);
  await expect(page.getByRole("navigation", { name: "Policy sections" }).getByText("Service Status")).toHaveCount(0);
  await expect(page.locator(".p321-services-full")).toHaveCount(0);
  await expect(page.locator(".p321-setting-row")).toHaveCount(15);
  await expect(page.locator(".p321-setting-group")).toHaveCount(4);
  await page.getByRole("button", { name: "B · Grouped Enterprise" }).click();
  await page.goto("/b?section=services&scenario=company-with-location&lang=en&theme=light");
  await expect(page.locator(".p321-services-full")).toBeVisible();
  await page.getByRole("button", { name: "D · Compact Workspace" }).click();
  await expect(page).toHaveURL(/\/d\?section=company&/);
  await expect(page.locator(".p321-services-full")).toHaveCount(0);
});

test("option D mobile navigation is accessible, closes on Escape, and focuses the selected pane", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/d?section=company&scenario=company-with-location&lang=ar&theme=dark");
  const toggle = page.locator(".issue321-option-d__mobile-toggle");
  const nav = page.locator("#issue321-option-d-sections");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(nav).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await nav.getByRole("button", { name: "حضور الورديات" }).focus();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await nav.getByRole("button", { name: "حضور الورديات" }).click();
  await expect(page).toHaveURL(/section=presence/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#p321-current-section")).toBeFocused();
  await expect(page.locator("#p321-current-section")).toHaveCount(1);
  await toggle.click();
  await nav.getByRole("button", { name: "حضور الورديات" }).click();
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
});
