import { type Page, expect } from "@playwright/test";

/**
 * Signs in via the real Employee UI sign-in form.
 * The Next.js rewrite proxies to the real API.
 */
export async function signInViaUi(
  page: Page,
  email: string,
  password: string,
): Promise<string> {
  await page.goto("/");
  // Wait for sign-in form to appear.
  await page.waitForSelector("text=Staff sign in", { timeout: 15_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/v1/staff/auth/login") &&
      response.request().method() === "POST",
  );
  await page.click('button:has-text("Sign In")');
  const response = await loginResponse;
  if (response.status() !== 200) {
    throw new Error(`Staff UI login failed: ${String(response.status())}`);
  }
  const body = (await response.json()) as { accessToken?: unknown };
  if (typeof body.accessToken !== "string") {
    throw new Error("Staff UI login returned no access token.");
  }
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({
    timeout: 20_000,
  });
  return body.accessToken;
}

/**
 * DEC-068 §5/§23: Check-In completes WITHOUT any key entry — a completed
 * vehicle condition leads straight to the Parking Task creation screen.
 */
export async function createParkingTaskViaUi(
  page: Page,
  input: { phone: string; plate: string },
): Promise<void> {
  await page.getByRole("button", { name: "New Vehicle" }).click();
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page.locator('input[placeholder="e.g. 12-34567"]').fill(input.plate);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Plate" }).click();
  // New, unrecognized vehicles pass through the optional details screen
  // before the customer contact step. Skipping details retains that flow.
  const skipDetails = page.getByRole("button", { name: "Skip vehicle details" });
  await expect(skipDetails).toBeVisible();
  await skipDetails.click();
  await page.locator('input[type="tel"]').fill(input.phone);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "No visible issue" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // No key-slot step exists on the normal path anymore.
  await expect(
    page.getByRole("button", { name: "Assign Key", exact: true }),
  ).toHaveCount(0);
  // Check-In ends at AWAITING_PARKING; Start Parking creates the real queue
  // task. No pre-parking key entry or separate task-creation button exists.
  await expect(page.getByRole("button", { name: "Start Parking" })).toBeVisible();
}

/**
 * DEC-068 §3 canonical physical order during parking completion: scan/enter
 * the Parking Spot, then place the key into any free slot and enter THAT
 * slot's code, then Confirm Parked.
 */
export async function completeParkingViaUi(
  page: Page,
  spotCode: string,
  keySlotCode: string,
): Promise<void> {
  // The caller has started parking before discovering the authoritative
  // queue task. The Park Vehicle action operates on that existing task.
  await page.getByRole("button", { name: "Park Vehicle" }).click();
  await page.getByRole("button", { name: "Enter spot code manually" }).click();
  await page.locator('input[placeholder="Enter spot code"]').fill(spotCode);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const keyInput = page.locator('input[placeholder="Enter Key Slot Code"]');
  await expect(keyInput).toBeVisible();
  await keyInput.fill(keySlotCode);
  await page.getByRole("button", { name: "Confirm Parked" }).click();
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
