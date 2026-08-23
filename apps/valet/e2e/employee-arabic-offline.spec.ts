import { expect, test } from "@playwright/test";

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? "e2e-driver@valet.test";
const STAFF_PASSWORD =
  process.env.E2E_STAFF_PASSWORD ?? "e2e-secure-password-123";

test("keeps authenticated Arabic live UI truthful through offline recovery", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const plate = `E2E-R-${String(Date.now()).slice(-7)}`;
  await page.goto("/");
  await page.getByRole("button", { name: "عربي" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("تسجيل دخول الموظفين")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await page.locator('input[type="email"]').fill(STAFF_EMAIL);
  await page.locator('input[type="password"]').fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByRole("heading", { name: "المهام" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "مركبة جديدة" }).click();
  await page.getByRole("button", { name: "إدخال يدوي" }).click();
  const plateInput = page.locator('input[placeholder="e.g. 12-34567"]');
  await expect(plateInput).toHaveAttribute("dir", "ltr");
  await plateInput.fill(plate);
  await page.getByRole("button", { name: "متابعة", exact: true }).click();
  await expect(
    page.locator('bdi[dir="ltr"]', { hasText: plate }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "تأكيد اللوحة" }).click();
  await page.locator('input[type="tel"]').fill("+962790000003");
  await page.getByRole("button", { name: "متابعة", exact: true }).click();
  await page.getByRole("button", { name: "لا توجد مشاكل ظاهرة" }).click();
  await page.getByRole("button", { name: "متابعة", exact: true }).click();
  await page.getByRole("button", { name: "إدخال خانة المفتاح يدوياً" }).click();
  const keyInput = page.locator('input[placeholder="أدخل رمز خانة المفتاح"]');
  await expect(keyInput).toHaveAttribute("dir", "ltr");
  await keyInput.fill(`E2E-KEY-R${testInfo.retry}`);
  await page.getByRole("button", { name: "تعيين المفتاح", exact: true }).click();
  await page.getByRole("button", { name: "إنشاء مهمة إيقاف" }).click();
  await page.getByRole("button", { name: "بدء الإيقاف" }).click();
  await expect(page.getByRole("button", { name: "الإبلاغ عن مشكلة" })).toBeVisible();
  await page.getByRole("button", { name: "اركن المركبة" }).click();
  await page.getByRole("button", { name: "إدخال رمز الموقع يدوياً" }).click();
  const spotInput = page.locator('input[placeholder="أدخل رمز الموقف"]');
  await expect(spotInput).toHaveAttribute("dir", "ltr");
  await spotInput.fill(`E2E-SPOT-R${testInfo.retry}`);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    downloadThroughput: -1,
    latency: 0,
    offline: true,
    uploadThroughput: -1,
  });
  await expect(
    page.getByText("لا يوجد اتصال بالشبكة. أعد الاتصال للتحديث والمتابعة."),
  ).toBeVisible();
  await page.getByRole("button", { name: "تأكيد موقع الإيقاف" }).click();
  await expect(page.getByText("تم تأكيد الإيقاف")).not.toBeVisible();
  const offlineBody = await page.locator("body").innerText();
  expect(offlineBody).not.toMatch(/sync|queue|تلقائي/i);

  await cdp.send("Network.emulateNetworkConditions", {
    downloadThroughput: -1,
    latency: 0,
    offline: false,
    uploadThroughput: -1,
  });
  await expect(
    page.getByText("لا يوجد اتصال بالشبكة. أعد الاتصال للتحديث والمتابعة."),
  ).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "اركن المركبة" })).toBeVisible();
  await expect(page.getByText("تم تأكيد الإيقاف")).not.toBeVisible();

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
