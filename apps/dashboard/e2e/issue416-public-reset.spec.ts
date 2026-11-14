import { expect, test } from "@playwright/test";

const token = `vspr1.${"A".repeat(43)}`;
const path = "/staff/reset-password";
const password = "A new synthetic password 416!";

test.use({ trace: "off" });

for (const arabic of [false, true]) {
  test(`standalone reset scrubs secret before any request, then redeems once ${arabic ? "AR RTL dark mobile" : "EN light desktop"}`, async ({ page }) => {
    await page.setViewportSize({ width: arabic ? 390 : 1440, height: 820 });
    await page.emulateMedia({ colorScheme: arabic ? "dark" : "light" });
    const observedRequests: string[] = [];
    page.on("request", (request) => observedRequests.push(request.url()));
    const sent: string[] = [];
    await page.route("**/v1/staff/**", async (route) => {
      const request = route.request();
      expect(request.url()).not.toContain(token);
      expect(JSON.stringify(request.headers())).not.toContain(token);
      expect(request.headers().authorization).toBeUndefined();
      expect(request.headers().referer).toBeUndefined();
      const body = request.postDataJSON();
      expect(Object.keys(body).sort()).toEqual(["newPassword", "resetToken"]);
      expect(body.resetToken).toBe(token);
      expect(body.newPassword).toBe(password);
      sent.push(request.url());
      await route.fulfill({ status: 200, json: { outcome: "PASSWORD_RESET_COMPLETE" } });
    });
    const response = await page.goto(`${path}#reset=${token}`);
    const headers = await response!.allHeaders();
    expect(headers["content-security-policy"]).toContain("script-src 'sha256-");
    expect(headers["content-security-policy"]).toContain("default-src 'none'");
    expect(headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(headers["content-security-policy"]).not.toContain("unsafe-inline");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["cache-control"]).toContain("no-store");
    expect(observedRequests).toHaveLength(1);
    expect(observedRequests.every((url) => !url.includes(token))).toBe(true);
    expect(new URL(page.url()).pathname).toBe(path);
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await expect.poll(() => new URL(page.url()).search).toBe("");
    await expect(page.locator("html")).toHaveAttribute("data-theme", arabic ? "dark" : "light");
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    if (arabic) {
      await page.locator("#reset-language").click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByLabel("كلمة المرور الجديدة", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "الوضع الفاتح" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    }
    expect(sent).toHaveLength(0);
    await page.locator("#reset-password").fill(password);
    await page.locator("#reset-confirm").fill(password);
    await page.locator("#reset-submit").click();
    await expect(page.locator("#reset-complete")).toBeVisible();
    await expect(page.locator("#reset-form")).toBeHidden();
    expect(sent).toHaveLength(1);
    expect(await page.context().cookies()).toEqual([]);
    await expect(page.getByRole("link", { name: arabic ? "تسجيل الدخول" : "Sign in" })).toBeVisible();
  });
}

test("malformed, duplicate, query-bearing or absent tokens cannot submit and reload has no token", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  let count = 0;
  await page.route("**/v1/staff/**", async (route) => { count++; await route.abort(); });
  for (const fragment of [
    "", "#reset=broken", `#reset=${token}&reset=${token}`,
    `#invite=${token}`, `?source=fixture#reset=${token}`, `#reset=vspr1%2E${"A".repeat(43)}`,
  ]) {
    await page.goto(`${path}${fragment}`);
    await expect(page.locator("#reset-missing")).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await expect.poll(() => new URL(page.url()).search).toBe("");
  }
  // A new fragment added to an already loaded document must never rearm it.
  await page.goto(`${path}#reset=${token}`);
  await expect(page.locator("#reset-form")).toBeHidden();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  const fresh = await page.context().newPage();
  await fresh.goto(`${path}#reset=${token}`);
  await expect(fresh.locator("#reset-form")).toBeVisible();
  await fresh.reload();
  await expect(fresh.locator("#reset-missing")).toBeVisible();
  expect(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await fresh.close();
  expect(count).toBe(0);
});

test("public reset requires explicit retry after a denied or uncertain response", async ({ page }) => {
  let count = 0;
  await page.route("**/v1/staff/auth/password-resets/redeem", async (route) => {
    count++;
    if (count === 1) await route.fulfill({ status: 401, json: { code: "STAFF_PASSWORD_RESET_INVALID" } });
    else await route.fulfill({ json: { outcome: "PASSWORD_RESET_COMPLETE" } });
  });
  await page.goto(`${path}#reset=${token}`);
  await page.locator("#reset-password").fill(password);
  await page.locator("#reset-confirm").fill(password);
  await page.locator("#reset-submit").click();
  await expect(page.locator("#reset-feedback")).toContainText("The link could not be used");
  expect(count).toBe(1);
  await page.locator("#reset-submit").click();
  await expect(page.locator("#reset-complete")).toBeVisible();
  expect(count).toBe(2);
});
