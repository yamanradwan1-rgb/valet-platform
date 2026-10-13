import { expect, test, type Page } from "@playwright/test";
import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";
import { DashboardApiFixture, E2E_IDS, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { TEST_INVITE, browserSecretPresent } from "./support/issue240d-onboarding";

const trigger = (page: Page, key: ContextHelpKey, locale: "en" | "ar" = "en") =>
  page.getByRole("button", {
    name: (locale === "ar" ? "مساعدة: " : "Help: ") + contextHelpRegistry[key][locale].title,
    exact: true,
  });

async function readHelp(page: Page, key: ContextHelpKey, locale: "en" | "ar" = "en") {
  const button = trigger(page, key, locale);
  await expect(button).toHaveAttribute("type", "button");
  await button.click();
  const child = page.getByRole("dialog", { name: contextHelpRegistry[key][locale].title });
  await expect(child).toContainText(contextHelpRegistry[key][locale].body);
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(button).toBeFocused();
}

test("Account Security Help mounts without selected Location and never invokes MFA", async ({ page }) => {
  const fixture = new DashboardApiFixture({ mfaState: "ASSURED" });
  await fixture.install(page);
  await page.goto("/security");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
  await expect(page.locator(".sidebar-scope")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  const before = [...fixture.counts.entries()].sort();
  for (const key of ["security.page", "security.sessions", "security.auth"] as const) {
    await readHelp(page, key);
  }
  expect([...fixture.counts.entries()].sort()).toEqual(before);
});

test("Help Foundation exposes its three sections only when account eligible", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: "ASSURED",
  });
  await fixture.install(page);
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  for (const key of ["help.page", "help.guides", "help.security", "help.faq"] as const) {
    await readHelp(page, key);
  }
  const firstFaq = page.locator("details").first();
  await firstFaq.locator("summary").click();
  await expect(firstFaq).toHaveAttribute("open", "");
  await readHelp(page, "help.faq");
  await expect(firstFaq).toHaveAttribute("open", "");
});

test("Standalone activation Help never leaks invitation or submits and preserves password", async ({ page }) => {
  let writes = 0;
  await page.route("**/v1/staff/**", async (route) => {
    writes++;
    await route.abort();
  });
  await page.goto(`/staff/activate#invite=${TEST_INVITE}`);
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  const input = page.getByLabel("Password", { exact: true });
  await input.fill("Unsaved synthetic password!");
  await readHelp(page, "activation.page");
  await readHelp(page, "activation.invitation");
  await expect(input).toHaveValue("Unsaved synthetic password!");
  expect(writes).toBe(0);
  expect(await browserSecretPresent(page)).toBe(false);
  await page.getByRole("button", { name: "EN / العربية" }).click();
  await readHelp(page, "activation.page", "ar");
  await readHelp(page, "activation.invitation", "ar");
  expect(await browserSecretPresent(page)).toBe(false);
});

test("Account Security Help is absent while enrollment secret and recovery codes are disclosed", async ({ page }) => {
  const secret = "ISSUE276SYNTHETICSECRET".padEnd(32, "A");
  const codes = Array.from({ length: 10 }, (_, i) => `vmr1-${String(i).padStart(11, "c")}-${"d".repeat(27)}`);
  const fixture = new DashboardApiFixture({
    mfaState: "ENROLLMENT_REQUIRED",
    override: (path) => {
      if (path === "/v1/staff/auth/mfa/enrollment/begin") return {
        body: { factorId: E2E_IDS.factor, provisioning: {
          algorithm: "SHA1", digits: 6, issuer: "VAYLET", periodSeconds: 30, secretBase32: secret,
        } },
      };
      if (path === "/v1/staff/auth/mfa/enrollment/confirm") return { body: { recoveryCodes: codes } };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/security");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(trigger(page, "security.page")).toBeVisible();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(page.getByText(secret, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Help:/u })).toHaveCount(0);
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  await expect(page.getByText(codes[0], { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Help:/u })).toHaveCount(0);
  await page.getByRole("button", { name: "I saved these codes" }).click();
  await expect(trigger(page, "security.page")).toBeVisible();
});
