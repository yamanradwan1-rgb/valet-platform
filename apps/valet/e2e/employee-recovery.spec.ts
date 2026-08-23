import { expect, test } from "@playwright/test";

import { setE2eShiftState } from "./support/database";
import { signInViaUi } from "./support/ui";

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test";
const STAFF_PASSWORD =
  process.env.E2E_STAFF_PASSWORD ?? "e2e-secure-password-123";

async function openPlateConfirmation(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "New Vehicle" }).click();
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page
    .locator('input[placeholder="e.g. 12-34567"]')
    .fill(`E2E-G-${String(Date.now()).slice(-7)}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm Plate" })).toBeVisible();
}

test.beforeEach(async () => setE2eShiftState("active"));

test("real shift loss rejects a protected command and closes stale UI", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
  await openPlateConfirmation(page);
  await setE2eShiftState("ended");

  await page.getByRole("button", { name: "Confirm Plate" }).click();
  await expect(page.getByText("No active shift")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Customer Contact")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Plate" })).not.toBeVisible();
});

test("navigation stays disabled while one real intake mutation is pending", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
  await openPlateConfirmation(page);

  let mutationCount = 0;
  await page.route("**/v1/staff/check-in/intake", async (route) => {
    mutationCount += 1;
    const realResponse = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({ response: realResponse });
  });

  await page.getByRole("button", { name: "Confirm Plate" }).click();
  const backButton = page.locator("main button").first();
  await expect(backButton).toBeDisabled();
  await backButton.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("button", { name: "Confirm Plate" })).toBeVisible();

  await expect(page.getByText("Customer Contact")).toBeVisible({
    timeout: 15_000,
  });
  expect(mutationCount).toBe(1);
  const recoveredBack = page.locator("main button").first();
  await expect(recoveredBack).toBeEnabled();
  await recoveredBack.click();
  await expect(page.getByRole("button", { name: "Confirm Plate" })).toBeVisible();
  expect(mutationCount).toBe(1);
});
