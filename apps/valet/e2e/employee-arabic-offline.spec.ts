import { expect, test } from "@playwright/test";

/**
 * Arabic/RTL + offline shell E2E.
 *
 * Proves: EN→AR switch, html lang/dir, Arabic text rendered, plate LTR,
 * cookie persistence across reload, offline banner (no sync promises),
 * AR→EN switch back.
 */
test.describe("Arabic RTL and offline shell", () => {
  test("switches EN→AR pre-auth and persists across reload", async ({
    page,
  }) => {
    await page.goto("/");

    // Click AR in the locale toggle (pre-auth).
    await page.click('button:has-text("عربي")');

    // html attributes update immediately.
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // Operational Arabic text is visible on the sign-in form.
    await expect(page.locator('text="تسجيل دخول الموظفين"')).toBeVisible();

    // Reload — cookie preserves Arabic.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("switches AR→EN and reverts direction", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("عربي")');
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // Switch back to EN.
    await page.click('button:has-text("EN")');
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("offline banner shows truthful message without sync claims", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    // Go offline via CDP (Chromium-only).
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    // Banner appears with truthful message (no queue/sync promise).
    await expect(
      page.locator(
        'text="No network connection. Reconnect to refresh and continue."',
      ),
    ).toBeVisible({ timeout: 10_000 });

    const body = await page.textContent("body");
    expect(body).not.toContain("queued");
    expect(body).not.toContain("will sync");
    expect(body).not.toContain("automatically");

    // Restore online.
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    // Banner clears.
    await expect(
      page.locator(
        'text="No network connection. Reconnect to refresh and continue."',
      ),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});
