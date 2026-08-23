import { expect, test, type Page } from "@playwright/test";

import { setE2eShiftState } from "./support/database";
import { signInViaUi } from "./support/ui";

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test";
const STAFF_PASSWORD =
  process.env.E2E_STAFF_PASSWORD ?? "e2e-secure-password-123";

async function openPlateConfirmation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New Vehicle" }).click();
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page
    .locator('input[placeholder="e.g. 12-34567"]')
    .fill(`E2E-G-${String(Date.now()).slice(-7)}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm Plate" })).toBeVisible();
}

async function reachKeyAssignment(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Confirm Plate" }).click();
  await page.locator('input[type="tel"]').fill("+962790000004");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "No visible issue" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter key slot manually" }).click();
}

test.beforeEach(async () => setE2eShiftState("active"));

test("navigation stays disabled while one real intake mutation is pending", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
  await openPlateConfirmation(page);
  await page.getByRole("button", { name: "Confirm Plate" }).click();
  await page.locator('input[type="tel"]').fill("+962790000005");

  let mutationCount = 0;
  await page.route("**/v1/staff/check-in/intakes", async (route) => {
    mutationCount += 1;
    const realResponse = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({ response: realResponse });
  });

  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const pendingBack = page.locator("main button").first();
  await expect(pendingBack).toBeDisabled();
  await pendingBack.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("heading", { name: "Customer Contact" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Vehicle Condition" })).toBeVisible({
    timeout: 15_000,
  });
  expect(mutationCount).toBe(1);
  await expect(page.locator("main button").first()).toBeEnabled();

  await page.getByRole("button", { name: "No visible issue" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Enter key slot manually" }).click();
  await page.locator('input[placeholder="Enter Key Slot Code"]').fill("E2E-KEY-G0");
  await page.getByRole("button", { name: "Assign Key", exact: true }).click();
  await page.getByRole("button", { name: "Create Parking Task" }).click();
  await page.getByRole("button", { name: "Start Parking" }).click();
  expect(mutationCount).toBe(1);
});

test("real shift loss rejects a protected command and closes stale UI", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
  await openPlateConfirmation(page);
  await reachKeyAssignment(page);
  await page.locator('input[placeholder="Enter Key Slot Code"]').fill("E2E-KEY-G1");
  await setE2eShiftState("ended");

  await page.getByRole("button", { name: "Assign Key", exact: true }).click();
  await expect(page.getByText("No active shift")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Create Parking Task" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Assign Key", exact: true })).not.toBeVisible();
});
