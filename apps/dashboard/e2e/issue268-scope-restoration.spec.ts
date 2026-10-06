import { expect, test, type Page } from "@playwright/test";

import { SELECTED_SCOPE_RESTORATION_KEY } from "../src/components/foundation/selected-scope-restoration-hint";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signIn, signInOnCurrentPage } from "./support/foundation-ui";
import { md04FeatureAuthority } from "./support/md04-fixtures";

async function selectLocationManagerScope(page: Page, locationName: string) {
  await signIn(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: locationName }).click();
}

async function openHelp(page: Page) {
  await page.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/help$/u);
  await expect(
    page.getByRole("heading", { name: "Help and product guidance" }),
  ).toBeVisible();
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("Company Admin exact active Location survives refresh on the same route", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await signIn(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await openHelp(page);

  await page.reload();

  await expect(page).toHaveURL(/\/help$/u);
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Help and product guidance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toHaveCount(0);
});

test("Location Manager restores exact Location B instead of first eligible Location A", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
  });
  await fixture.install(page);
  await selectLocationManagerScope(page, LOCATION_B.name);
  await openHelp(page);

  await page.reload();

  await expect(page).toHaveURL(/\/help$/u);
  await expect(page.locator(".topbar").getByText(LOCATION_B.name)).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Help and product guidance" })).toBeVisible();
});

test("Supervisor restores only the same active membership Location and Shift", async ({ page }) => {
  const fixture = new DashboardApiFixture({ operationalContexts: [supervisorContext()] });
  await fixture.install(page);
  await signIn(page, "supervisor@example.com");
  await page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }).click();
  await expect(page).toHaveURL(/\/maps-zones$/u);
  await expect(page.getByRole("heading", { name: "Maps & Zones" })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/maps-zones$/u);
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maps & Zones" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toHaveCount(0);
});

test("removed prior Location fails closed instead of silently selecting another Location", async ({ page }) => {
  let restorationPhase = false;
  const locationPath = `/v1/staff/dashboard/organizations/${ORG_A.organizationId}/locations`;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: (path) => restorationPhase && path === locationPath
      ? { body: { items: [LOCATION_A], nextCursor: null } }
      : undefined,
  });
  await fixture.install(page);
  await selectLocationManagerScope(page, LOCATION_B.name);
  await openHelp(page);
  restorationPhase = true;

  await page.reload();

  await expect(page).toHaveURL(/\/help$/u);
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toHaveCount(0);
  await expect(page.locator(".topbar").getByText(LOCATION_B.name)).toHaveCount(0);
});

test("direct protected URL load restores scope without redirecting to root", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await selectLocationManagerScope(page, LOCATION_A.name);

  await page.goto("/maps-zones");

  await expect(page).toHaveURL(/\/maps-zones$/u);
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maps & Zones" })).toBeVisible();
});

test("intentional Change scope clears restoration continuity", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await selectLocationManagerScope(page, LOCATION_A.name);
  await page.locator(".sidebar-scope").click();
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  await expect.poll(() => page.evaluate(
    (key) => sessionStorage.getItem(key),
    SELECTED_SCOPE_RESTORATION_KEY,
  )).toBeNull();

  await page.reload();

  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toHaveCount(0);
});

test("valid delayed restoration uses existing loading state and never flashes the chooser", async ({ page }) => {
  let gateRestoration = false;
  const started = deferred();
  const release = deferred();
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (!gateRestoration || path !== "/v1/staff/dashboard/organizations") return undefined;
      started.resolve();
      await release.promise;
      return { body: { items: [ORG_A], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await selectLocationManagerScope(page, LOCATION_A.name);
  await openHelp(page);
  gateRestoration = true;

  const reload = page.reload();
  await started.promise;
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Loading");
  release.resolve();
  await reload;

  await expect(page).toHaveURL(/\/help$/u);
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Help and product guidance" })).toBeVisible();
});

test("restoration preserves Dark Arabic presentation without adding responsive behavior", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await selectLocationManagerScope(page, LOCATION_A.name);
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("button", { name: "Language" }).click();
  await page.goto("/help");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "المساعدة وإرشادات المنتج" })).toBeVisible();
});

test("fresh login with a different logical session cannot inherit the prior hint", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await selectLocationManagerScope(page, LOCATION_A.name);
  await openHelp(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await signInOnCurrentPage(page, "manager@example.com");

  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toHaveCount(0);
});

test("Company Admin subscription-only scope survives reload through fresh Organization authority", async ({ page }) => {
  const fixture = new DashboardApiFixture({ companyOrganizations: [ORG_A] });
  await fixture.install(page);
  await page.goto("/billing-subscription");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByRole("heading", { name: "Billing & Subscription" })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/billing-subscription$/u);
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Billing & Subscription" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toHaveCount(0);
});

test("Location Manager grant-set scope survives reload from current grant-set authority", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => path === "/v1/staff/dashboard/feature-authority"
      ? md04FeatureAuthority(request, "LM")
      : undefined,
  });
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByRole("heading", { name: "Visit Contacts" })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/customers$/u);
  await expect(page.locator(".sidebar").getByText(ORG_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visit Contacts" })).toBeVisible();
  await expect(page.getByText("Authorized Locations", { exact: true })).toBeVisible();
});

test("transient restoration failure preserves the hint and a later reload can recover", async ({ page }) => {
  let failRestore = false;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => failRestore && path === "/v1/staff/dashboard/organizations"
      ? { status: 503, body: { code: "UNAVAILABLE", message: "temporary", requestId: "issue268-transient" } }
      : undefined,
  });
  await fixture.install(page);
  await selectLocationManagerScope(page, LOCATION_A.name);
  await openHelp(page);
  failRestore = true;

  await page.reload();
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" })).toBeVisible();
  await expect.poll(() => page.evaluate(
    (key) => sessionStorage.getItem(key),
    SELECTED_SCOPE_RESTORATION_KEY,
  )).not.toBeNull();

  failRestore = false;
  await page.reload();
  await expect(page).toHaveURL(/\/help$/u);
  await expect(page.locator(".topbar").getByText(LOCATION_A.name)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Help and product guidance" })).toBeVisible();
});
