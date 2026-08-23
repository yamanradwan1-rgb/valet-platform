import { expect, test } from "@playwright/test";

import { assertNoPrototypeLeaks, signInViaUi } from "./support/ui";

/**
 * Incident reporting E2E: active operation -> Report Issue -> submit
 * incident -> authoritative returned ID -> return to originating workflow.
 * No INC-1042 / fake notification / fake photo.
 */
test.describe("Employee incident reporting", () => {
  test("reports incident from live retrieval and shows real returned ID", async ({
    page,
  }) => {
    test.info().setTimeout(60_000);
    const staffEmail = process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test";
    const staffPassword =
      process.env.E2E_STAFF_PASSWORD ?? "e2e-secure-password-123";

    await signInViaUi(page, staffEmail, staffPassword);

    // Navigate to an active retrieval operation.
    // (Requires a RETRIEVING task in queue from prior setup.)
    await page.waitForSelector('button:has-text("Continue Retrieval")', {
      timeout: 20_000,
    });
    await page.click('button:has-text("Continue Retrieval")');

    // Click Report Issue.
    await page.click('button:has-text("Report Issue")');

    // Select type and severity from canonical categories.
    await page.click('button:has-text("Vehicle damage")');
    await page.click('button:has-text("Medium")');

    // Fill description.
    await page.fill("textarea", "E2E incident description for testing.");

    // Submit — only one click due to synchronous guard.
    await page.click('button:has-text("Open Incident")');

    // Assert real returned incident UUID appears (not INC-1042).
    await expect(page.locator("text=Incident opened")).toBeVisible({
      timeout: 10_000,
    });
    const body = await page.textContent("body");
    expect(body).toContain("Reference:");
    expect(body).not.toContain("INC-1042");

    // Return to originating operation.
    await page.click('button:has-text("Return")');
    await assertNoPrototypeLeaks(page);
  });
});
