import { expect, test } from "@playwright/test";

import { assertNoPrototypeLeaks, signInViaUi } from "./support/ui";

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test";
const STAFF_PASSWORD =
  process.env.E2E_STAFF_PASSWORD ?? "e2e-secure-password-123";

test("reports an order-independent incident from a real operation", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  const plate = `E2E-I-${String(Date.now()).slice(-7)}`;
  await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
  // Current Check-In path: vehicle details can be skipped, and condition
  // completion leads directly to Start Parking (no pre-parking Key Slot).
  await page.getByRole("button", { name: "New Vehicle" }).click();
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page.locator('input[placeholder="e.g. 12-34567"]').fill(plate);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Plate" }).click();
  await page.getByRole("button", { name: "Skip vehicle details" }).click();
  await page.locator('input[type="tel"]').fill("+962790000002");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "No visible issue" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Assign Key" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Parking Task" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start Parking" }).click();
  // The Start Parking click initiates the authoritative mutation, but click()
  // does not await the HTTP response or the transition into the live parking
  // screen. Finish that transition before simulating an offline incident.
  await expect(page.getByRole("button", { name: "Park Vehicle" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report Issue" })).toBeVisible();

  // Live incidents require an authoritative A1 session read. An offline
  // attempt must not show a report form or fabricated success/reference.
  await context.setOffline(true);
  await page.getByRole("button", { name: "Report Issue" }).click();
  await expect(page.getByText("Cannot establish session context")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Incident" })).toHaveCount(0);
  await expect(page.getByText("Incident opened")).toHaveCount(0);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Vehicle damage" })).toBeVisible();

  await page.getByRole("button", { name: "Vehicle damage" }).click();
  await page.getByRole("button", { name: "Medium" }).click();
  await page
    .locator("textarea")
    .fill("Independent Employee E2E incident from active parking.");
  await page.getByRole("button", { name: "Open Incident" }).click();

  await expect(page.getByText("Incident opened")).toBeVisible({
    timeout: 15_000,
  });
  const body = await page.textContent("body");
  expect(body).toMatch(
    /Reference:\s*[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  expect(body).not.toContain("INC-1042");
  expect(body).not.toContain("Supervisor notified");
  expect(body).not.toContain("Add Photo");

  await page.getByRole("button", { name: "Return" }).click();
  await expect(page.getByRole("button", { name: "Park Vehicle" })).toBeVisible();
  await assertNoPrototypeLeaks(page);
});
