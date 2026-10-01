import { expect, test } from "@playwright/test";
import {
  browserSecretPresent,
  TEST_INVITE,
} from "./support/issue240d-onboarding";

test.use({ trace: "off" });

for (const arabic of [false, true]) {
  test(`standalone activation ${arabic ? "AR dark RTL" : "EN light"} strips secret and submits once without auth/session`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: arabic ? 480 : 1440, height: 900 });
    const requests: { path: string; method: string; safe: boolean }[] = [];
    let bodySafe = false;
    await page.route("**/v1/staff/**", async (route) => {
      const request = route.request();
      requests.push({
        path: new URL(request.url()).pathname,
        method: request.method(),
        safe:
          !request.url().includes(TEST_INVITE) &&
          !JSON.stringify(request.headers()).includes(TEST_INVITE),
      });
      const body = request.postDataJSON();
      bodySafe =
        Object.keys(body).sort().join(",") === "inviteToken,password" &&
        body.inviteToken === TEST_INVITE;
      await route.fulfill({
        json: { outcome: "ACTIVATED" },
        headers: { "Cache-Control": "no-store" },
      });
    });
    await page.goto(`/staff/activate#invite=${TEST_INVITE}`);
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash === "").toBe(true);
    expect(requests.length).toBe(0);
    expect(await browserSecretPresent(page)).toBe(false);
    if (arabic) {
      await page.getByRole("button", { name: "EN / العربية" }).click();
      await page.getByRole("button", { name: "Dark / داكن" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    await page.screenshot({ path: info.outputPath("activation.png") });
    const password = page.getByLabel(arabic ? "كلمة المرور" : "Password", {
      exact: true,
    });
    await password.fill("Synthetic chosen password 240D!");
    await password.press("Enter");
    await expect(
      page.getByRole("heading", {
        name: arabic ? "اكتمل التفعيل" : "Activation complete",
      }),
    ).toBeVisible();
    expect(requests).toEqual([
      { path: "/v1/staff/auth/activate", method: "POST", safe: true },
    ]);
    expect(bodySafe).toBe(true);
    expect(await browserSecretPresent(page)).toBe(false);
    expect((await page.context().cookies()).length).toBe(0);
    await expect(
      page.getByRole("link", { name: arabic ? "تسجيل الدخول" : "Sign in" }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("activation-complete.png") });
  });
}

test("missing/malformed/duplicate invite produces no request; reload requires the original link", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/v1/staff/**", async (route) => {
    count++;
    await route.abort();
  });
  for (const fragment of [
    "",
    "#invite=bad",
    `#invite=${TEST_INVITE}&invite=${TEST_INVITE}`,
    `#other=${TEST_INVITE}`,
  ]) {
    await page.goto(`/staff/activate${fragment}`);
    await expect(
      page.getByText(
        "Open the original invitation link to activate your account.",
      ),
    ).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash === "").toBe(true);
  }
  await page.goto(`/staff/activate#invite=${TEST_INVITE}`);
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "Open the original invitation link to activate your account.",
    ),
  ).toBeVisible();
  expect(count).toBe(0);
});

test("generic failure and Retry-After require explicit retries, including a delayed response", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/v1/staff/auth/activate", async (route) => {
    count++;
    if (count === 1)
      await route.fulfill({
        status: 401,
        json: { code: "STAFF_ACTIVATION_FAILED" },
      });
    else if (count === 2)
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "1" },
        json: { code: "STAFF_ACTIVATION_RATE_LIMITED" },
      });
    else {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({ json: { outcome: "ALREADY_ACTIVATED" } });
    }
  });
  await page.goto(`/staff/activate#invite=${TEST_INVITE}`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic chosen password 240D!");
  const submit = page.getByRole("button", {
    name: "Activate account",
    exact: true,
  });
  await submit.click();
  await expect(page.getByRole("status")).toContainText(
    "Activation could not be completed",
  );
  expect(count).toBe(1);
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Too many attempts");
  await expect(submit).toBeEnabled();
  expect(count).toBe(2);
  await submit.click();
  await expect(
    page.getByRole("heading", { name: "Activation complete" }),
  ).toBeVisible();
  expect(count).toBe(3);
});
