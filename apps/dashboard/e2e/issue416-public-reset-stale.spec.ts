import { expect, test } from "@playwright/test";

const token = `vspr1.${"A".repeat(43)}`;
const password = "A safe replacement password 416!";
const redeem = "**/v1/staff/auth/password-resets/redeem";

test.use({ trace: "off" });

for (const status of [200, 503]) {
  test(`fragment invalidation fences delayed public redeem HTTP ${status} response`, async ({
    page,
  }) => {
    let requests = 0;
    let releaseResponse: (() => void) | undefined;
    const released = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route(redeem, async (route) => {
      requests++;
      await released;
      await route.fulfill({
        status,
        json:
          status === 200
            ? { outcome: "PASSWORD_RESET_COMPLETE" }
            : {
                code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
                message: "Retry",
                requestId: "delayed",
              },
      });
    });

    await page.goto(`/staff/reset-password#reset=${token}`);
    await page.locator("#reset-password").fill(password);
    await page.locator("#reset-confirm").fill(password);
    await page.locator("#reset-submit").click();
    await expect.poll(() => requests).toBe(1);
    await page.evaluate(() => {
      window.location.hash = "#discarded-credential";
    });
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await expect(page.locator("#reset-form")).toBeHidden();
    await expect(page.locator("#reset-missing")).toBeVisible();
    await expect(page.locator("#reset-password")).toHaveValue("");
    await expect(page.locator("#reset-confirm")).toHaveValue("");

    const response = page.waitForResponse((item) =>
      item.url().includes("/password-resets/redeem"),
    );
    releaseResponse!();
    await response;
    await page.waitForTimeout(150); // allow the stale async callback to settle
    await expect(page.locator("#reset-missing")).toBeVisible();
    await expect(page.locator("#reset-complete")).toBeHidden();
    await expect(page.locator("#reset-unknown")).toBeHidden();
    expect(requests).toBe(1); // no automatic replay or new-token import
  });
}

for (const width of [320, 390, 1440]) {
  test(`public reset keyboard RTL and theme on ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: width === 390 ? "light" : "dark" });
    let requests = 0;
    await page.route(redeem, async (route) => {
      requests++;
      await route.fulfill({ json: { outcome: "PASSWORD_RESET_COMPLETE" } });
    });
    await page.goto(`/staff/reset-password#reset=${token}`);
    await expect(page.locator("#reset-form")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.locator("#reset-language")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.keyboard.press("Tab");
    await expect(page.locator("#reset-theme")).toBeFocused();
    const before = await page.locator("html").getAttribute("data-theme");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-theme",
      before!,
    );
    await page.keyboard.press("Tab");
    await expect(page.locator("#reset-password")).toBeFocused();
    await page.keyboard.type(password);
    await page.keyboard.press("Tab");
    await expect(page.locator("#reset-confirm")).toBeFocused();
    await page.keyboard.type(password);
    await page.keyboard.press("Tab");
    await expect(page.locator("#reset-submit")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#reset-complete")).toBeVisible();
    expect(requests).toBe(1);
  });
}
