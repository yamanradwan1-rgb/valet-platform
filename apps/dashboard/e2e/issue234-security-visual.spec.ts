import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  DashboardApiFixture,
  E2E_IDS,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { setLocaleTheme } from "./support/md-r09-fixtures";

const statePath = "/v1/staff/auth/mfa/state";
const beginPath = "/v1/staff/auth/mfa/enrollment/begin";
const reissuePath = "/v1/staff/auth/mfa/recovery-codes/reissue";
const syntheticSecret = "ISSUE234VISUALSECRET".padEnd(32, "A");
const syntheticCodes = Array.from(
  { length: 10 },
  (_, index) => `vmr1-${String(index).padStart(11, "v")}-${"w".repeat(27)}`,
);

async function signInOnSecurity(page: Page) {
  await page.goto("/security");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function assertNativeSecurityFrame(page: Page, width: number, rtl: boolean) {
  await expect(page.locator(".shell")).toBeVisible();
  const title = page.locator("h1");
  await expect(title).toHaveCount(1);
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("line-height", "32px");
  await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr");
  if (width <= 820) {
    await page
      .getByRole("button", { name: rtl ? "فتح التنقل" : "Open navigation" })
      .click();
    await expect(
      page.getByRole("link", { name: rtl ? "الأمان" : "Security" }),
    ).toHaveAttribute("aria-current", "page");
    await page
      .getByRole("button", { name: rtl ? "إغلاق التنقل" : "Close navigation" })
      .click();
  } else {
    await expect(
      page.getByRole("link", { name: rtl ? "الأمان" : "Security" }),
    ).toHaveAttribute("aria-current", "page");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

for (const visual of [
  { name: "en-desktop-light", width: 1440, locale: "en" as const, dark: false },
  { name: "en-desktop-dark", width: 1440, locale: "en" as const, dark: true },
  { name: "en-narrow", width: 480, locale: "en" as const, dark: false },
  { name: "ar-desktop-light", width: 1440, locale: "ar" as const, dark: false },
  { name: "ar-desktop-dark", width: 1440, locale: "ar" as const, dark: true },
  { name: "ar-narrow", width: 480, locale: "ar" as const, dark: false },
] as const) {
  test(`Security visual ${visual.name}`, async ({ page }, info) => {
    const fixture = new DashboardApiFixture({ mfaState: "ASSURED" });
    await fixture.install(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInOnSecurity(page);
    await setLocaleTheme(page, visual.locale, visual.dark);
    await page.setViewportSize({ width: visual.width, height: 900 });
    await assertNativeSecurityFrame(page, visual.width, visual.locale === "ar");
    await expect(page.getByRole("status")).toContainText(
      visual.locale === "ar" ? "تم التحقق" : "Verified",
    );
    await screenshot(page, info, visual.name);
  });
}

test("Security visual states use the same Dashboard surfaces", async ({ page }, info) => {
  let stateMode: "checking" | "error" | "enrollment" | "step-up" | "assured" = "checking";
  let releaseChecking!: () => void;
  const checking = new Promise<void>((resolve) => { releaseChecking = resolve; });
  const fixture = new DashboardApiFixture({
    override: async (path) => {
      if (path === statePath) {
        if (stateMode === "checking") await checking;
        if (stateMode === "error") {
          return {
            status: 503,
            body: { code: "MFA_SECURITY_UNAVAILABLE", message: "unavailable", requestId: "visual-error" },
          };
        }
        const state = stateMode === "enrollment"
          ? "ENROLLMENT_REQUIRED"
          : stateMode === "step-up"
            ? "STEP_UP_REQUIRED"
            : "ASSURED";
        return { body: { state } };
      }
      if (path === beginPath) {
        return {
          body: {
            factorId: E2E_IDS.factor,
            provisioning: {
              algorithm: "SHA1",
              digits: 6,
              issuer: "VAYLET",
              periodSeconds: 30,
              secretBase32: syntheticSecret,
            },
          },
        };
      }
      if (path === reissuePath) {
        if (stateMode === "error") {
          return {
            status: 503,
            body: { code: "MFA_SECURITY_UNAVAILABLE", message: "unavailable", requestId: "visual-reissue-error" },
          };
        }
        return { body: { factorId: E2E_IDS.factor, recoveryCodes: syntheticCodes } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/security");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toContainText("Checking server status");
  await screenshot(page, info, "checking");

  releaseChecking();
  await expect(page.getByRole("status")).toContainText("Verified");
  stateMode = "error";
  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await expect(page.getByRole("status")).toContainText("Account security unavailable");
  await screenshot(page, info, "error");

  stateMode = "enrollment";
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Set up authenticator" })).toBeVisible();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(page.getByText(syntheticSecret, { exact: true })).toBeVisible();
  await screenshot(page, info, "enrollment");

  stateMode = "step-up";
  await page.getByRole("button", { name: "Close this ceremony" }).click();
  await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
  await expect(page.getByLabel("Recovery code")).toBeVisible();
  await screenshot(page, info, "verification-recovery");

  stateMode = "assured";
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Replace recovery codes" }).click();
  await expect(page.getByText(syntheticCodes[0]!, { exact: true })).toBeVisible();
  await screenshot(page, info, "recovery-disclosure");
});

test("Security visual preserves scoped shell presentation", async ({ page }, info) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "ASSURED",
  });
  await fixture.install(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await page.getByRole("link", { name: "Security" }).click();
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await assertNativeSecurityFrame(page, 1280, false);
  await screenshot(page, info, "scoped-shell");
});
