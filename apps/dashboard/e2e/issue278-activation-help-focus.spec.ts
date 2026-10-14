import { expect, test } from "@playwright/test";
import { contextHelpRegistry } from "../src/features/help/context-help-registry";
import { TEST_INVITE, browserSecretPresent } from "./support/issue240d-onboarding";

test.use({ trace: "off" });

for (const locale of ["en", "ar"] as const) {
  test(`activation succeeds while nested Help is open and restores safe focus (${locale})`, async ({ page }) => {
    let release: (() => void) | undefined;
    let attempts = 0;
    let signalRequest!: () => void;
    const requestStarted = new Promise<void>((resolve) => { signalRequest = resolve; });
    await page.route("**/v1/staff/auth/activate", async (route) => {
      attempts++;
      signalRequest();
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ json: { outcome: "ACTIVATED" } });
    });
    await page.goto(`/staff/activate#invite=${TEST_INVITE}`);
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    if (locale === "ar") await page.getByRole("button", { name: "EN / العربية" }).click();
    const passwordField = page.locator("#activation-password");
    await passwordField.fill("Synthetic password, not a credential!");
    await passwordField.press("Enter");
    await requestStarted;
    const key = "activation.invitation";
    const help = page.getByRole("button", { name:
      `${locale === "ar" ? "مساعدة: " : "Help: "}${contextHelpRegistry[key][locale].title}`, exact: true });
    await help.click();
    const dialog = page.getByRole("dialog", { name: contextHelpRegistry[key][locale].title, exact: true });
    await expect(dialog).toBeVisible();
    expect(attempts).toBe(1);
    expect(await browserSecretPresent(page)).toBe(false);
    release?.();
    await expect(page.getByRole("heading", { name: locale === "ar" ? "اكتمل التفعيل" : "Activation complete" })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    const signIn = page.getByRole("link", { name: locale === "ar" ? "تسجيل الدخول" : "Sign in" });
    await expect(signIn).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.activeElement !== document.body &&
      document.activeElement?.isConnected === true)).toBe(true);
    expect(attempts).toBe(1);
    expect(await browserSecretPresent(page)).toBe(false);
    expect(await page.locator("[role=dialog]").count()).toBe(0);
  });
}

test("closing pending activation Help preserves the password and never submits twice", async ({ page }) => {
  let attempts = 0;
  let release: (() => void) | undefined;
  await page.route("**/v1/staff/auth/activate", async (route) => {
    attempts++;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: { outcome: "ACTIVATED" } });
  });
  await page.goto(`/staff/activate#invite=${TEST_INVITE}`);
  const field = page.locator("#activation-password");
  await field.fill("Synthetic password, not a credential!");
  await page.getByRole("button", {
    name: `Help: ${contextHelpRegistry["activation.page"].en.title}`, exact: true,
  }).click();
  await page.keyboard.press("Escape");
  await expect(field).toHaveValue("Synthetic password, not a credential!");
  await field.press("Enter");
  await expect.poll(() => attempts).toBe(1);
  release?.();
  await expect(page.getByRole("heading", { name: "Activation complete" })).toBeVisible();
  expect(attempts).toBe(1);
});

test("invalid invitation hash transition closes Help and retains focus on the stable heading", async ({ page }) => {
  await page.goto(`/staff/activate#invite=${TEST_INVITE}`);
  await expect(page.locator("#activation-password")).toBeVisible();
  await page.getByRole("button", {
    name: `Help: ${contextHelpRegistry["activation.invitation"].en.title}`, exact: true,
  }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => { window.location.hash = "#invite=invalid"; });
  await expect(page.locator("#activation-password")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Activate account" })).toBeFocused();
  expect(await browserSecretPresent(page)).toBe(false);
});
