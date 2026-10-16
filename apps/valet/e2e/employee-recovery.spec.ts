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

async function reachParkingTask(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Confirm Plate" }).click();
  await page.getByRole("button", { name: "Skip vehicle details" }).click();
  await page.locator('input[type="tel"]').fill("+962790000004");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "No visible issue" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start Parking" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign Key" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Parking Task" })).toHaveCount(0);
}

test.beforeEach(async () => setE2eShiftState("active"));

test("navigation stays disabled while one real intake mutation is pending", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
  await openPlateConfirmation(page);
  await page.getByRole("button", { name: "Confirm Plate" }).click();
  await page.getByRole("button", { name: "Skip vehicle details" }).click();
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
  // DEC-068: the only live action now is Start Parking; key custody is bound
  // AFTER the parking spot has been selected.
  await expect(page.getByRole("button", { name: "Assign Key" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Parking Task" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start Parking" }).click();
  await page.getByRole("button", { name: "Park Vehicle" }).click();
  await page.getByRole("button", { name: "Enter spot code manually" }).click();
  await page.locator('input[placeholder="Enter spot code"]').fill("E2E-SPOT-G0");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const keySlotInput = page.locator('input[placeholder="Enter Key Slot Code"]');
  await expect(keySlotInput).toBeVisible();
  await keySlotInput.fill("E2E-KEY-G0");
  // The physical deposit is a protected online mutation; no offline success.
  await context.setOffline(true);
  await expect(page.getByRole("button", { name: "Confirm Parked" })).toBeDisabled();
  await expect(page.getByText("Parking confirmed")).toHaveCount(0);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Confirm Parked" }).click();
  await expect(page.getByText("Parking confirmed")).toBeVisible();
  expect(mutationCount).toBe(1);
});

test("real shift loss rejects protected Start Parking and closes stale UI", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
  await openPlateConfirmation(page);
  await reachParkingTask(page);
  await setE2eShiftState("ended");

  await page.getByRole("button", { name: "Start Parking" }).click();
  await expect(page.getByText("No active shift")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Start Parking" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Park Vehicle" })).toHaveCount(0);
});
