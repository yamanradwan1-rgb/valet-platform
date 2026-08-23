import { type Page, expect } from "@playwright/test";

/**
 * Signs in via the real Employee UI sign-in form.
 * The Next.js rewrite proxies to the real API.
 */
export async function signInViaUi(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/");
  // Wait for sign-in form to appear.
  await page.waitForSelector("text=Staff sign in", { timeout: 15_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign In")');
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({
    timeout: 20_000,
  });
}

export async function createParkingTaskViaUi(
  page: Page,
  input: { keySlot: string; phone: string; plate: string },
): Promise<void> {
  await page.getByRole("button", { name: "New Vehicle" }).click();
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page.locator('input[placeholder="e.g. 12-34567"]').fill(input.plate);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Plate" }).click();
  await page.locator('input[type="tel"]').fill(input.phone);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "No visible issue" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter key slot manually" }).click();
  await page.locator('input[placeholder="Enter Key Slot Code"]').fill(input.keySlot);
  await page.getByRole("button", { name: "Assign Key", exact: true }).click();
  await page.getByRole("button", { name: "Create Parking Task" }).click();
  await expect(page.getByRole("button", { name: "Start Parking" })).toBeVisible();
}

export async function completeParkingViaUi(
  page: Page,
  spotCode: string,
): Promise<void> {
  await page.getByRole("button", { name: "Start Parking" }).click();
  await page.getByRole("button", { name: "Park Vehicle" }).click();
  await page.getByRole("button", { name: "Enter spot code manually" }).click();
  await page.locator('input[placeholder="Enter spot code"]').fill(spotCode);
  await page.getByRole("button", { name: "Confirm Parking" }).click();
  await expect(page.getByText("Parking confirmed")).toBeVisible({ timeout: 15_000 });
}

/** Asserts that no prototype fixture leaks into live markup. */
export async function assertNoPrototypeLeaks(page: Page): Promise<void> {
  const body = await page.textContent("body");
  const forbidden = [
    "Mohammed Khalil",
    "Four Seasons Amman",
    "Main Entrance",
    "4821",
    "INC-1042",
    "Notified ✓",
    "BMW X5 · 12-34567",
  ];
  for (const fixture of forbidden) {
    expect(body).not.toContain(fixture);
  }
}
