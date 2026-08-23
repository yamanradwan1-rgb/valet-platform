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
