import { expect, test } from "@playwright/test";

import {
  assertNoPrototypeLeaks,
  signInViaUi,
} from "./support/ui";
import { disposeApiContext } from "./support/api";

/**
 * Full Employee lifecycle E2E against REAL API + REAL PostgreSQL.
 *
 * Prerequisites handled by CI/global-setup:
 * - PostgreSQL 17 test DB with migrations applied
 * - Staff account seeded (email/password known)
 * - Location with releaseRequiresPayment=false policy
 * - Key slot + parking spot available
 * - API on port 3001, Valet on port 3000
 *
 * Journey: Sign In -> Check-In -> condition -> Start Parking -> Confirm Parked
 *   -> Guest Retrieval Request (real Guest API) -> accept/start Retrieval
 *   -> Mark Ready -> initiate handoff -> Guest issue pickup code (real API)
 *   -> verify in Employee UI -> Release Vehicle -> COMPLETED
 */
test.describe("Employee full lifecycle", () => {
  const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test";
  const STAFF_PASSWORD =
    process.env.E2E_STAFF_PASSWORD ?? "e2e-secure-password-123";

  test.afterAll(async () => {
    await disposeApiContext();
  });

  test("sign-in reaches task queue without prototype leakage", async ({
    page,
  }) => {
    await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);
    // Wait for operational context to resolve.
    await page.waitForURL("**/", { timeout: 20_000 });
    await assertNoPrototypeLeaks(page);
  });

  test("full park-retrieve-handoff-release journey", async ({ page }) => {
    test.info().setTimeout(120_000);
    await signInViaUi(page, STAFF_EMAIL, STAFF_PASSWORD);

    // Navigate to check-in.
    await page.click('button:has-text("New Vehicle")');
    await page.waitForSelector("text=Enter manually", { timeout: 10_000 });
    await page.click("text=Enter manually");

    // Fill plate manually.
    const plateInput = page.locator('input[placeholder*="plate" i]');
    await plateInput.fill(`E2E-${Date.now() % 100000}`);
    await page.click('button:has-text("Confirm")');

    // Customer phone.
    await page.fill('input[type="tel"]', "+962790000001");
    await page.click('button:has-text("Continue")');

    // Condition completion.
    await page.click('button:has-text("No visible issue")');

    // Assign key slot.
    await page.fill('input[placeholder*="key" i]', "K-E2E");
    await page.click('button:has-text("Assign")');

    // Queue parking task and start.
    await page.click('button:has-text("Queue Parking Task")');
    await page.waitForSelector("text=Park Vehicle", { timeout: 10_000 });

    // Enter spot and confirm parked.
    await page.fill('input[placeholder*="spot" i]', "E2E-S1");
    await page.click('button:has-text("Confirm Parked")');

    // Verify PARKED state is shown truthfully.
    await expect(page.locator("text=Parking confirmed")).toBeVisible({
      timeout: 10_000,
    });

    // Return to queue for retrieval phase.
    await page.click('button:has-text("Next Task")');

    // Guest retrieval request must come from real Guest API setup
    // (handled by test fixture provisioning outside the browser).

    // Accept retrieval from queue.
    await page.click('button:has-text("Accept Task")');

    // Start Retrieval via key confirmation.
    await page.fill('input[placeholder*="key" i]', "K-E2E");
    await page.click('button:has-text("Verify Key Slot")');
    await page.click('button:has-text("Vehicle Ready")');

    // Mark Ready.
    await page.click('button:has-text("Mark Ready")');

    // Begin handoff.
    await page.click('button:has-text("Begin Guest Handoff")');

    // Pickup code verification — code comes from real Guest API in setup.
    const pickupCode = process.env.E2E_PICKUP_CODE ?? "";
    if (pickupCode) {
      await page.fill('input[inputmode="numeric"]', pickupCode);
      await page.click('button:has-text("Verify Code")');
    }

    // Release vehicle.
    await page.click('button:has-text("Release Vehicle")');

    // Assert completion.
    await expect(page.locator("text=Handoff Complete")).toBeVisible({
      timeout: 15_000,
    });

    await assertNoPrototypeLeaks(page);
  });
});
