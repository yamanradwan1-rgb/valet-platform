import { expect, test, type Page, type Route } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, LOCATION_B, ORG_A,
} from "./support/dashboard-api-fixture";
import { guestContactFixture } from "./support/guest-contact-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

type Failure = "network" | "server" | "malformed" | "denied" | "success";

async function enterPreview(page: Page, failure: { mode: Failure }) {
  const { fixture } = guestContactFixture();
  await fixture.install(page);
  let attempts = 0;
  await page.route(/\/v1\/staff\/management\/.*\/guest-information\/preview\?/u,
    async (route: Route) => {
      attempts += 1;
      if (failure.mode === "success") return route.fallback();
      if (failure.mode === "network") return route.abort("failed");
      if (failure.mode === "malformed") {
        return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ unexpected: "payload" }) });
      }
      if (failure.mode === "denied") {
        return route.fulfill({ status: 403, contentType: "application/json",
          body: JSON.stringify({ code: "AUTHORIZATION_DENIED", message: "Not authorized",
            requestId: "synthetic-preview-denied" }) });
      }
      return route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ code: "UNAVAILABLE", message: "Preview unavailable",
          requestId: "synthetic-preview-error" }) });
    });
  await page.goto("/help");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  await page.goto("/guest-information");
  await page.locator('[data-view-target="contact"]').click();
  await page.locator("[data-guest-preview] > summary").click();
  const preview = page.locator('[data-widget="preview"]');
  await expect(preview).toBeVisible();
  await expect.poll(() => attempts).toBeGreaterThan(0);
  return { preview, attempts: () => attempts, fixture };
}

for (const mode of ["network", "server", "malformed"] as const) {
  test(`#359 ${mode} preview failure settles and offers retry`, async ({ page }, info) => {
    const settled: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/guest-information/preview?"))
        settled.push(String(response.status()));
    });
    page.on("requestfailed", (request) => {
      if (request.url().includes("/guest-information/preview?"))
        settled.push("network-failed");
    });
    const failure: { mode: Failure } = { mode };
    const { preview, fixture } = await enterPreview(page, failure);
    await expect.poll(() => settled.length).toBeGreaterThan(0);
    const root = `/v1/staff/management/organizations/${ORG_A.organizationId}`;
    expect(fixture.count(`${root}/locations/${LOCATION_A.locationId}/guest-information/privacy`))
      .toBeGreaterThan(0);
    expect(fixture.count(`${root}/locations/${LOCATION_A.locationId}/guest-information/contact`))
      .toBeGreaterThan(0);
    expect(fixture.count(`${root}/guest-information/contact/defaults`)).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`phase-a-${mode}.png`), fullPage: true });
    await expect(preview.getByRole("alert")).toBeVisible();
    await expect(preview.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(preview).not.toContainText("Loading…");
  });
}

test("#359 preview retry recovers without dropping unsaved Location Contact edits", async ({ page }) => {
  const failure: { mode: Failure } = { mode: "server" };
  const { preview, attempts } = await enterPreview(page, failure);
  await expect(preview.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByRole("button", { name: "Set a location value" }).click();
  const unsaved = page.locator("#guest-information-override-phone");
  await unsaved.fill("0790000000");
  await expect(page.getByText("Unsaved edits", { exact: true })).toBeVisible();

  failure.mode = "success";
  await preview.getByRole("button", { name: "Retry" }).click();
  await expect(preview.getByText("Guest-visible preview", { exact: true })).toBeVisible();
  await expect(preview.getByRole("alert")).toHaveCount(0);
  await expect(unsaved).toHaveValue("0790000000");
  expect(attempts()).toBe(2);
});

test("#359 denied refresh replaces the saved preview in Arabic RTL and both themes", async ({ page }) => {
  const failure: { mode: Failure } = { mode: "success" };
  const { preview } = await enterPreview(page, failure);
  await expect(preview.getByText("Guest-visible preview", { exact: true })).toBeVisible();
  failure.mode = "denied";
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(preview.getByRole("alert")).toBeVisible();
  await expect(preview.getByText("Guest-visible preview", { exact: true })).toHaveCount(0);
  await expect(preview.getByRole("button", { name: "إعادة المحاولة" })).toBeVisible();
  await page.getByRole("button", { name: "داكن" }).click();
  await expect(preview.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "فاتح" }).click();
  await expect(preview.getByRole("alert")).toBeVisible();
  failure.mode = "success";
  await preview.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect(preview.getByRole("alert")).toHaveCount(0);
});

test("#359 cancelled older locale preview cannot replace the latest preview", async ({ page }) => {
  const failure: { mode: Failure } = { mode: "success" };
  const { preview } = await enterPreview(page, failure);
  await expect(preview.getByText("Guest-visible preview", { exact: true })).toBeVisible();
  let delayedArabic = 0;
  const response = (locale: "en" | "ar") => ({
    locale,
    privacy: { status: "UNAVAILABLE", text: null, url: null,
      version: null, publishedAt: null },
    contact: { displayName: locale === "ar" ? "STALE_AR" : "LATEST_EN",
      phone: null, supportUrl: null, hours: null },
  });
  await page.route(/\/v1\/staff\/management\/.*\/guest-information\/preview\?/u,
    async (route) => {
      const locale = new URL(route.request().url()).searchParams.get("locale") === "ar"
        ? "ar" : "en";
      if (locale === "ar") {
        delayedArabic++;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(response(locale)) }).catch(() => undefined);
    });
  await page.getByRole("button", { name: "Language" }).click();
  await expect.poll(() => delayedArabic).toBe(1);
  await page.getByRole("button", { name: "اللغة" }).click();
  await expect(preview.getByText("LATEST_EN", { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(preview.getByText("STALE_AR", { exact: true })).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("#359 switching Location fences a pending preview from the previous Location", async ({ page }) => {
  const root = `/v1/staff/management/organizations/${ORG_A.organizationId}`;
  const localRoot = `${root}/locations/`;
  let releaseOld: () => void = () => undefined;
  const pendingOld = new Promise<void>((resolve) => { releaseOld = resolve; });
  const inherit = { mode: "INHERIT", value: null };
  const values = { displayName: inherit, phone: inherit,
    supportUrl: inherit, hours: inherit, hoursConfirmed: false };
  const effective = {
    displayName: { source: "COMPANY", value: "Company Desk" },
    phone: { source: "COMPANY", value: null },
    supportUrl: { source: "COMPANY", value: null },
    hours: { source: "COMPANY", value: null },
  };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    mfaState: "ASSURED",
    override: async (path, request) => {
      if (path === `${root}/guest-information/overview`) return { body: {
        companyName: ORG_A.name,
        locations: [LOCATION_A, LOCATION_B].map((location) => ({
          id: location.locationId, name: location.name,
          privacy: "NOT_SET", contact: "AVAILABLE",
        })),
        publishedCount: 0,
      } };
      if (path === `${root}/guest-information/contact/defaults`) return { body: {
        organizationId: ORG_A.organizationId, revision: 0, updatedAt: null,
        values: { displayName: "Company Desk", phone: null, supportUrl: null,
          hours: null, hoursConfirmed: false },
      } };
      if (!path.startsWith(localRoot)) return undefined;
      const locationId = path.slice(localRoot.length).split("/")[0];
      if (locationId !== LOCATION_A.locationId && locationId !== LOCATION_B.locationId)
        return undefined;
      const base = `${localRoot}${locationId}/guest-information`;
      if (path === `${base}/privacy`) return { body: {
        organizationId: ORG_A.organizationId, locationId, revision: 0,
        updatedAt: null, drafts: { en: { text: "", url: "" }, ar: { text: "", url: "" } },
        published: null, publishedVersion: null, publishedAt: null,
      } };
      if (path === `${base}/contact`) return { body: {
        organizationId: ORG_A.organizationId, locationId, revision: 0,
        updatedAt: null, values, effective,
      } };
      if (path === `${base}/preview`) {
        if (locationId === LOCATION_A.locationId) await pendingOld;
        return { body: {
          locale: new URL(request.url()).searchParams.get("locale") ?? "en",
          privacy: { status: "UNAVAILABLE", text: null, url: null,
            version: null, publishedAt: null },
          contact: { displayName: locationId === LOCATION_A.locationId
            ? "STALE_LOCATION_A" : "CURRENT_LOCATION_B",
            phone: null, supportUrl: null, hours: null },
        } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/help");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name, exact: true }).click();
  await page.goto("/guest-information");
  await expect.poll(() => fixture.count(
    `${localRoot}${LOCATION_A.locationId}/guest-information/preview`)).toBeGreaterThan(0);
  await page.locator("#opt2-overview summary").click();
  await page.locator("#opt2-overview .v-location-item")
    .filter({ hasText: LOCATION_B.name }).click();
  await expect(page.locator(".opt2-location strong")).toHaveText(LOCATION_B.name);
  await page.locator('[data-view-target="contact"]').click();
  await page.locator("[data-guest-preview] > summary").click();
  await expect(page.locator('[data-widget="preview"]'))
    .toContainText("CURRENT_LOCATION_B");
  releaseOld();
  await page.waitForTimeout(150);
  await expect(page.locator('[data-widget="preview"]'))
    .not.toContainText("STALE_LOCATION_A");
  expect(fixture.count(`${localRoot}${LOCATION_A.locationId}/guest-information/preview`))
    .toBeGreaterThan(0);
  expect(fixture.count(`${localRoot}${LOCATION_B.locationId}/guest-information/preview`))
    .toBeGreaterThan(0);
});
