import { expect, test } from "./support/runtime-test";

import {
  browserApiStatus,
  controlFixture,
  runtimeFixture as f,
  selectCompany,
  selectLocation,
  signIn,
  totp,
} from "./support/runtime-fixture";

// Auth and recovery tests expose ephemeral codes. Keep sensitive browser
// diagnostics out of retained traces and clear page DOM before teardown.
test.use({ trace: "off", screenshot: "off", video: "off" });
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.goto("about:blank");
});

test("guest and disabled Staff cannot enter Management", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);

  await page.getByLabel("Email").fill(f.emails.disabled);
  await page.getByLabel("Password").fill(
    process.env.E2E_STAFF_PASSWORD ?? "md06 browser password",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Management navigation" }),
  ).toHaveCount(0);
});

test("Location Manager is limited to persisted grants and tenant", async ({ page }) => {
  await controlFixture("grant", "locationManager", "on");
  const accessToken = await signIn(page, f.emails.locationManager);
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: f.organizations.a.name }).click();
  await expect(page.getByRole("button", { name: f.locations.a.name })).toBeVisible();
  await expect(page.getByRole("button", { name: f.locations.b.name })).toBeVisible();
  await expect(
    page.getByRole("button", { name: f.locations.ungranted.name }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "All Locations" })).toHaveCount(0);

  expect(
    await browserApiStatus(
      page,
      accessToken,
      `/v1/staff/dashboard/locations/${f.locations.ungranted.id}/subscription`,
    ),
  ).toBe(404);
  expect(
    await browserApiStatus(
      page,
      accessToken,
      `/v1/staff/dashboard/locations/${f.locations.foreign.id}/subscription`,
    ),
  ).toBe(404);
  expect(
    await browserApiStatus(
      page,
      accessToken,
      `/v1/staff/management/organizations/${f.organizations.a.id}/analytics/all-locations?from=2026-09-01&to=2026-09-02`,
    ),
  ).toBe(404);

  await page.getByRole("button", { name: f.locations.a.name }).click();
  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  await expect(navigation.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Locations" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Roles & Permissions" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Integrations" })).toHaveCount(0);
});

test("foreign Location Manager sees only the foreign tenant grant", async ({ page }) => {
  await signIn(page, f.emails.foreignManager);
  await expect(
    page.getByRole("button", { name: f.organizations.b.name }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: f.organizations.a.name }),
  ).toHaveCount(0);
  await selectLocation(page, f.organizations.b.name, f.locations.foreign.name);
  await expect(
    page.locator(".topbar").getByText(f.locations.foreign.name),
  ).toBeVisible();
});

test("Supervisor stays narrow and Employee has no Management workspace", async ({
  browser,
}) => {
  const supervisor = await browser.newContext();
  const supervisorPage = await supervisor.newPage();
  await signIn(supervisorPage, f.emails.supervisor);
  await supervisorPage
    .getByRole("button", { name: `${f.organizations.a.name} · ${f.locations.a.name}` })
    .click();
  const navigation = supervisorPage.getByRole("navigation", {
    name: "Management navigation",
  });
  await expect(navigation.getByRole("link", { name: "Maps & Zones" })).toBeVisible();
  for (const forbidden of ["Administration", "Analytics", "Reports", "Visit Contacts"]) {
    await expect(navigation.getByRole("link", { name: forbidden })).toHaveCount(0);
  }
  await supervisor.close();

  const employee = await browser.newContext();
  const employeePage = await employee.newPage();
  await signIn(employeePage, f.emails.employee);
  await expect(
    employeePage.getByText(
      "No eligible Management workspace is available for this Staff session.",
    ).first(),
  ).toBeVisible();
  await expect(
    employeePage.getByRole("navigation", { name: "Management navigation" }),
  ).toHaveCount(0);
  await employee.close();
});

test("Company Admin MFA enrollment, freshness loss, recovery, refresh and logout are real", async ({
  page,
}) => {
  await signIn(page, f.emails.companyAdmin);
  await expect(page.getByRole("status").filter({ hasText: "MFA status:" }))
    .toContainText("Setup required");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = (await page.locator("bdi.bidi-code").first().textContent())?.trim();
  expect(/^[A-Z2-7]{32}$/u.test(secret ?? "")).toBe(true);
  await page.getByLabel("6-digit authenticator code").fill(totp(secret!));
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  await expect.poll(() => page.getByRole("heading", { name: "Recovery codes" }).isVisible()).toBe(true);
  await expect.poll(() => page.locator("ol li").count()).toBe(10);
  const recoveryCodes = await page.locator("ol li").allTextContents();
  // Assurance becoming verified must NOT prematurely unmount one-time codes.
  await expect.poll(async () => (
    await page.getByRole("status").filter({ hasText: "MFA status:" }).textContent()
  )?.includes("Verified") ?? false).toBe(true);
  await expect.poll(() => page.locator("ol li").count()).toBe(10);
  const leaked = await page.evaluate((codes) => {
    const persistent = JSON.stringify({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
      url: location.href,
    });
    return codes.some((code) => persistent.includes(code));
  }, recoveryCodes);
  expect(leaked).toBe(false);
  const saved = page.getByRole("button", { name: "I saved these codes" });
  await saved.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.locator("ol li").count()).toBe(0);
  await expect.poll(() => page.getByRole("button", { name: f.organizations.a.name }).isVisible()).toBe(true);

  await selectCompany(page);
  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  await expect(navigation.getByRole("link", { name: "Employees & Shifts" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Reports" })).toBeVisible();
  await page.getByRole("button", { name: "Change scope" }).first().click();
  await expect(page.getByRole("heading", {
    name: "Choose your authorized workspace",
  })).toBeVisible();
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await expect(page.locator(".topbar").getByText(f.locations.a.name)).toBeVisible();

  let refreshes = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/v1/staff/auth/refresh") refreshes += 1;
  });
  await page.reload();
  // Accepted scope restoration (#268) must preserve the authorized Location
  // when refreshing a fully assured session, rather than reopening chooser.
  await expect(page.locator(".topbar").getByText(f.locations.a.name))
    .toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Choose your authorized workspace",
  })).toHaveCount(0);
  expect(refreshes).toBe(1);

  // The fixture backdates created_at to satisfy the MFA timestamp constraint.
  // Do not change a live document's session identity under its background reads.
  const restoreUrl = page.url();
  // Replace, rather than append to, the history entry so the final
  // logout/back-navigation check still exercises the original history.
  await Promise.all([
    page.waitForURL("about:blank"),
    page.evaluate(() => window.location.replace("about:blank")),
  ]);
  expect(refreshes).toBe(1);
  await controlFixture("age-mfa", "companyAdmin", "31");
  // Keep failure evidence useful without recording recovery codes, tokens,
  // response bodies, DOM content, cookies, or full URLs.
  const authResponses: Array<{ endpoint: "refresh" | "mfa-state"; status: number }> = [];
  const recordAuthResponse = (response: import("@playwright/test").Response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/v1/staff/auth/refresh") {
      authResponses.push({ endpoint: "refresh", status: response.status() });
    } else if (path === "/v1/staff/auth/mfa/state") {
      authResponses.push({ endpoint: "mfa-state", status: response.status() });
    }
  };
  page.on("response", recordAuthResponse);
  try {
    await Promise.all([
      page.waitForURL((url) => url.href === restoreUrl),
      page.evaluate((url) => window.location.replace(url), restoreUrl),
    ]);
    await expect(page.getByRole("status").filter({ hasText: "MFA status:" }))
      .toContainText("Verification required");
    expect(refreshes).toBe(2);
    expect(authResponses).toContainEqual({ endpoint: "refresh", status: 200 });
    expect(authResponses).toContainEqual({ endpoint: "mfa-state", status: 200 });
  } catch (error) {
    const [signInVisible, chooserVisible, managementVisible, mfaStatusVisible, alertVisible] =
      await Promise.all([
        page.getByRole("heading", { name: "Sign in" }).isVisible(),
        page.getByRole("heading", { name: "Choose your authorized workspace" }).isVisible(),
        page.getByRole("navigation", { name: "Management navigation" }).isVisible(),
        page.getByRole("status").filter({ hasText: "MFA status:" }).first().isVisible(),
        page.getByRole("alert").first().isVisible(),
      ]).catch(() => [null, null, null, null, null]);
    console.info("MFA_FRESHNESS_RESTORE_FAILURE", JSON.stringify({
      authResponses, signInVisible, chooserVisible, managementVisible,
      mfaStatusVisible, alertVisible,
    }));
    throw error;
  } finally {
    page.off("response", recordAuthResponse);
  }
  await page.getByLabel("Recovery code").fill(recoveryCodes[0]!);
  await page.getByRole("button", { name: "Use recovery code" }).click();
  await expect.poll(() => page.getByRole("heading", { name: "Authenticator setup" }).isVisible()).toBe(true);
  const replacement = (await page.locator("bdi.bidi-code").first().textContent())?.trim();
  expect(/^[A-Z2-7]{32}$/u.test(replacement ?? "")).toBe(true);
  await page.getByLabel("6-digit authenticator code").fill(totp(replacement!));
  await page.getByRole("button", { name: "Confirm authenticator" }).click();
  await expect.poll(() => page.getByRole("heading", { name: "Recovery codes" }).isVisible()).toBe(true);
  await expect.poll(() => page.locator("ol li").count()).toBe(10);
  await page.getByRole("button", { name: "I saved these codes" }).click();
  await expect.poll(() => page.locator("ol li").count()).toBe(0);
  await expect.poll(() => page.getByRole("button", { name: f.organizations.a.name }).isVisible()).toBe(true);

  // Establish real protected history after the fixture's document replacement.
  await selectCompany(page);
  await navigation.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/reports$/u);
  await navigation.getByRole("link", { name: "Employees & Shifts" }).click();
  await expect(page).toHaveURL(/\/employees$/u);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/reports$/u);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Management navigation" }),
  ).toHaveCount(0);
  await expect(page.getByText(f.contact.displayName)).toHaveCount(0);
});

test("revoked Staff session fails closed on the next browser restore", async ({ page }) => {
  await signIn(page, f.emails.locationManager);
  await selectLocation(page, f.organizations.a.name, f.locations.a.name);
  await controlFixture("revoke-sessions", "locationManager");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Management navigation" }),
  ).toHaveCount(0);
});
