import { expect, test, type Page } from "@playwright/test";
import { companySettings } from "./support/administration-fixtures";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { captureIssue432State as captureState } from "./support/issue432-screenshot";
import { companyPolicy } from "./support/presence-data";

const companySettingsPath = "/v1/staff/management/organizations/" + ORG_A.organizationId + "/settings";

test.beforeEach(async ({ page }) => page.addInitScript(() => localStorage.setItem("vaylet_dashboard_locale", "en")));

async function ensureLocale(page: Page, locale: "en" | "ar") {
  if (await page.locator("html").getAttribute("lang") !== locale) await page.getByRole("button", { name: /Language|اللغة/u }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
}

function dashboardReadFixture(path: string) {
  if (path.endsWith("/shift-presence/policy")) return { body: companyPolicy() };
  if (path.includes("/shift-presence/") && /\/(zones|exceptions)$/u.test(path)) {
    return { body: { items: [], nextCursor: null } };
  }
  if (path.endsWith("/whatsapp-settings")) {
    return {
      body: {
        organizationId: ORG_A.organizationId, locationId: null,
        policy: { enabled: null, language: null, templateCatalogVersion: null, providerBindingId: null, revision: 0 },
        companyDefault: null, globalSendEnabled: false, activationReady: false,
        approvedTemplateVersions: [], connections: [],
      },
    };
  }
  return undefined;
}

function createCompanyAdminFixture() {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === companySettingsPath && request.method() === "GET"
      ? { body: companySettings() }
      : dashboardReadFixture(path),
  });
}

function watchRequests(page: Page) {
  const staff: { method: string; path: string }[] = [];
  const externalNonStaff: string[] = [];
  const unmockedApi: string[] = [];
  const nonStaffWrites: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.startsWith("/v1/staff/")) staff.push({ method, path: url.pathname });
    else {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/")) unmockedApi.push(url.origin + url.pathname);
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) nonStaffWrites.push(method + " " + url.origin + url.pathname);
      if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) externalNonStaff.push(url.origin + url.pathname);
    }
  });
  return { staff, externalNonStaff, unmockedApi, nonStaffWrites };
}

async function openRealDashboard(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/policies?section=operations&prototype=alerts&variant=a");
  await expect.poll(async () => {
    const body = await page.locator("body").innerText();
    return body.includes("Sign in") || body.includes("Choose your authorized workspace");
  }, { timeout: 20_000 }).toBe(true);
  if (await page.getByRole("heading", { name: "Sign in" }).count()) await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText("Loading authorized scope…")).toHaveCount(0);
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(page.locator('[data-setting="checkInPhotosRequired"]')).toBeVisible();
  await expect(page.locator(".management-alert-bell")).toBeVisible();
  await ensureLocale(page, "en");
  if (process.env.ISSUE432_OWNER_REVIEW === "1") await page.pause();
}

async function openPanel(page: Page) {
  await page.locator(".management-alert-bell").click();
  const panel = page.locator(".alerts-panel");
  await expect(panel).toBeVisible();
  return panel;
}

function assertFixtureOnly(
  network: ReturnType<typeof watchRequests>,
  fixture: DashboardApiFixture,
) {
  expect([...fixture.counts.values()].reduce((total, count) => total + count, 0)).toBe(network.staff.length);
  expect(network.staff.filter(({ method, path }) =>
    method !== "GET" && !path.startsWith("/v1/staff/auth/"),
  )).toEqual([]);
  expect(network.staff.filter(({ path }) => path.toLowerCase().includes("alert"))).toEqual([]);
  expect(network.externalNonStaff).toEqual([]);
  expect(network.unmockedApi).toEqual([]);
  expect(network.nonStaffWrites).toEqual([]);
}

test("real Dashboard prototype: scope, scenarios, Seen, keyboard and local-only interactions", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const fixture = createCompanyAdminFixture();
  const network = watchRequests(page);
  await openRealDashboard(page, fixture);
  await expect(page.locator(".issue432-prototype-tools")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+P");
  const controls = page.getByRole("complementary", { name: "Demo controls" });
  await expect(controls).toBeVisible();
  const scenario = controls.getByLabel("State fixtures");
  const role = controls.getByLabel("Demo actor role");
  const location = controls.getByLabel("Current location");
  const connection = controls.getByLabel("Connection");
  const bell = page.locator(".management-alert-bell");
  await page.setViewportSize({ width: 1440, height: 900 });

  let panel = await openPanel(page);
  await captureState(page, "mixed");
  await scenario.selectOption("empty");
  await expect(panel.getByText("You're all caught up")).toBeVisible();
  await captureState(page, "scenario-empty");
  await scenario.selectOption("one");
  await expect(panel.locator('[data-category="ALT-08"]')).toHaveCount(1);
  await captureState(page, "one");
  await scenario.selectOption("multiple");
  await captureState(page, "mixed");
  await scenario.selectOption("overflow");
  await expect(panel.locator(".alert-card")).toHaveCount(20);
  await expect(bell.locator(".management-alert-badge")).toHaveText("20+");
  await expect(panel.locator('[data-category="ALT-14"], [data-category="ALT-17"]')).toHaveCount(0);
  const highIncident = panel.locator('[data-category="ALT-08"]').filter({ hasText: "High-severity incident needs attention" });
  await expect(highIncident.locator(".severity-chip")).toHaveText("Important");
  await captureState(page, "scenario-overflow");

  await scenario.selectOption("destination-unavailable");
  await expect(panel.locator(".alert-card-content")).toHaveCount(3);
  for (const state of ["unavailable", "missing", "unauthorized"] as const) {
    await expect(panel.locator(`[data-testid="synthetic-destination-status"][data-destination-state="${state}"]`)).toHaveCount(1);
  }
  await expect(panel.locator("a[data-testid='synthetic-destination-link']")).toHaveCount(0);
  await captureState(page, "destination-unavailable-missing-unauthorized");
  const beforeRowClick = page.url();
  await panel.locator(".alert-card-content").first().click();
  expect(page.url()).toBe(beforeRowClick);

  await role.selectOption("unauthorized");
  await expect(panel.getByText("Notification access is unavailable.")).toBeVisible();
  await expect(panel.getByText("You're all caught up")).toHaveCount(0);
  await captureState(page, "list-unauthorized");
  await role.selectOption("company-admin");
  await scenario.selectOption("multiple");
  await controls.getByRole("button", { name: "Add Organization event" }).click();
  const orgEvent = panel.locator('[data-category="ALT-15"]');
  await expect(orgEvent).toBeVisible();
  await expect(orgEvent.locator(".alert-location")).toHaveCount(0);
  await captureState(page, "alt15-company-admin-downtown");

  await location.selectOption("west");
  panel = await openPanel(page);
  await expect(panel.locator('[data-category="ALT-15"]')).toBeVisible();
  await expect(panel.locator('[data-category="ALT-15"] .alert-location')).toHaveCount(0);
  await location.selectOption("downtown");
  panel = await openPanel(page);
  await expect(panel.locator('[data-category="ALT-15"]')).toBeVisible();
  await expect(panel.locator('[data-category="ALT-15"] .alert-location')).toHaveCount(0);

  await role.selectOption("location-manager");
  await expect(panel.locator('[data-category="ALT-15"]')).toHaveCount(0);
  await expect(panel.locator('[data-category="ALT-05"]')).toHaveCount(0);
  await expect(panel.locator('[data-category="ALT-13"] .seen-unavailable')).toBeVisible();
  await expect(panel.locator('[data-category="ALT-13"] .seen-action')).toHaveCount(0);
  await captureState(page, "role-location-manager-alt13-seen-unavailable");
  await role.selectOption("company-admin");
  await expect(panel.locator('[data-category="ALT-13"] .seen-action')).toBeVisible();

  const organizationSeen = panel.locator('[data-category="ALT-15"] .seen-action');
  await organizationSeen.click();
  await expect(organizationSeen).toBeDisabled();
  await expect(panel.locator('[data-category="ALT-15"] .seen-action')).toContainText("Confirming Seen…");
  expect(await panel.locator(".seen-action").evaluateAll((buttons) =>
    buttons.every((button) => (button as HTMLButtonElement).disabled),
  )).toBe(true);
  await expect(panel.locator('[data-category="ALT-15"]')).toHaveCount(0);
  await location.selectOption("west");
  panel = await openPanel(page);
  await expect(panel.locator('[data-category="ALT-15"]')).toHaveCount(0);
  await location.selectOption("downtown");
  panel = await openPanel(page);
  await expect(panel.locator('[data-category="ALT-15"]')).toHaveCount(0);
  await captureState(page, "seen-success");

  await controls.getByRole("checkbox", { name: "Fail next Seen" }).check();
  const firstSeen = panel.locator(".seen-action").first();
  await firstSeen.click();
  await expect(panel.getByText("Seen confirmation failed — retry")).toBeVisible();
  await expect(firstSeen).toBeFocused();
  await captureState(page, "seen-failure");
  const failedCategory = await firstSeen.locator("xpath=ancestor::li").getAttribute("data-category");
  await firstSeen.click();
  await expect(panel.locator('[data-category="' + failedCategory + '"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? ""))
    .toMatch(/seen-action|alerts-close/u);

  await panel.locator(".alerts-close").click();
  await expect(bell).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("synthetic-destination-link")).toBeFocused();
  await panel.getByTestId("synthetic-destination-link").click();
  await expect(page).toHaveURL(/#SIM-TARGET-INCIDENT-1042$/u);
  await expect(page.getByTestId("synthetic-destination-preview")).toBeFocused();
  await captureState(page, "keyboard-focus");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();
  await bell.click();
  await page.locator(".ps-pane-header h2").click();
  await expect(panel).toHaveCount(0);

  await scenario.selectOption("loading");
  panel = await openPanel(page);
  await expect(panel.getByText("Loading the synthetic preview…")).toBeVisible();
  await expect(bell.locator(".management-alert-badge")).toHaveText("—");
  await captureState(page, "scenario-loading");
  await scenario.selectOption("failure");
  await expect(panel.getByText("Could not refresh.")).toBeVisible();
  const staleBadge = await bell.locator(".management-alert-badge").innerText();
  await expect(page.locator(".issue432-sr-only[role=status]")).toContainText(staleBadge);
  await controls.getByRole("button", { name: "Retry preview" }).click();
  await expect(panel.getByText("Loading the synthetic preview…")).toBeVisible();
  await expect(panel.getByText("Could not refresh.")).toHaveCount(0, { timeout: 3_000 });
  await scenario.selectOption("slow");
  await expect(panel.getByText("Slow response simulated; try Retry.")).toBeVisible();
  await expect(panel.locator(".alert-card")).toHaveCount(0);
  await expect(panel.locator(".alert-card")).not.toHaveCount(0, { timeout: 3_000 });
  await scenario.selectOption("multiple");
  await connection.selectOption("offline");
  await expect(panel.getByRole("button", { name: "Retry preview" })).toHaveCount(0);
  await controls.getByRole("button", { name: "Reconnect" }).click();
  await expect(panel.getByText("Preview reconnecting")).toBeVisible();
  await expect(panel.getByText("Preview ready")).toBeVisible({ timeout: 3_000 });
  await panel.locator(".alerts-close").focus();
  await connection.evaluate((element) => {
    const select = element as HTMLSelectElement;
    select.value = "revoked";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute("aria-disabled", "true");
  await expect(bell).toBeFocused();
  await expect(page.locator(".issue432-sr-only[role=status]")).toContainText("Revoked");
  await connection.selectOption("connected");
  await expect(bell).toHaveAttribute("aria-disabled", "false");

  await location.selectOption("west");
  panel = await openPanel(page);
  await controls.getByRole("button", { name: "New incident arrives" }).click();
  await expect(panel.getByText("A newly opened critical incident needs attention at West Parking.")).toBeVisible();
  const activeBeforeResolve = await panel.locator('[data-kind="ACTIVE"]').count();
  await controls.getByRole("button", { name: "Resolve active alert" }).click();
  await expect(panel.locator('[data-kind="ACTIVE"]')).toHaveCount(activeBeforeResolve - 1);
  const occurrencesBeforeWithdraw = await panel.locator('[data-kind="OCCURRENCE"]').count();
  await controls.getByRole("button", { name: "Withdraw event" }).click();
  await expect(panel.locator('[data-kind="OCCURRENCE"]')).toHaveCount(occurrencesBeforeWithdraw - 1);
  await controls.getByRole("button", { name: "Cross time threshold" }).click();
  await expect(panel.locator('[data-category="ALT-01"]')).toBeVisible({ timeout: 4_000 });
  const beforeBurst = await panel.locator(".alert-card").count();
  await controls.getByRole("button", { name: "Burst of arrivals" }).click();
  await expect(panel.locator(".alert-card")).toHaveCount(Math.min(20, beforeBurst + 3), { timeout: 3_000 });

  await controls.getByRole("button", { name: "Simulate presence expiry" }).click();
  await expect(panel.locator('[data-category="ALT-12"]')).toBeVisible();
  await expect(panel.locator('[data-category="ALT-12"]')).toHaveCount(0, { timeout: 3_000 });
  await controls.getByRole("button", { name: "Advance event beyond 7 days" }).click();
  await expect(panel.locator('[data-kind="OCCURRENCE"]')).toHaveCount(0);
  await captureState(page, "scenario-time-expiry");

  assertFixtureOnly(network, fixture);
});
