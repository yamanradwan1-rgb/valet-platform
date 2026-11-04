import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  companySettings,
  locationManagerConfiguration,
} from "./support/administration-fixtures";
import { signInOnCurrentPage } from "./support/foundation-ui";

const feature = process.env.NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE1 === "enabled";
const location = LOCATION_A.locationId;
const org = ORG_A.organizationId;
const previewPath = `/v1/staff/dashboard/locations/${location}/alerts/preview`;
const incidentDetailPath = `/v1/staff/dashboard/locations/${location}/alerts/sources/ALT-08/incident-1`;
const timingPath = `/v1/staff/management/organizations/${org}/locations/${location}/alert-timing-preferences`;
const settingsPath = `/v1/staff/management/organizations/${org}/settings`;
const noChromeDevIndicator = "nextjs-portal { display: none !important; }";

async function openStudioSection(page: Page, section: "operations" | "alertsTiming") {
  const mobileIndex = page.locator(".ps-mobile-index");
  if (await mobileIndex.isVisible()) {
    const nav = page.locator(".ps-section-links");
    if (await nav.getAttribute("data-open") !== "true") await mobileIndex.click();
  }
  await page.locator(`.ps-section-links a[href*="section=${section}"]`).click();
}

function fixtureForAlerts(
  role: "COMPANY_ADMIN" | "LOCATION_MANAGER",
) {
  let revision = 0;
  let writes = 0;
  let grace = 0;
  const api = new DashboardApiFixture({
    ...(role === "COMPANY_ADMIN"
      ? {
          companyOrganizations: [ORG_A],
          companyLocations: { [org]: [LOCATION_A] },
        }
      : {
          locationManagerOrganizations: [ORG_A],
          locationManagerLocations: { [org]: [LOCATION_A] },
        }),
    override: (path, request) => {
      if (path === settingsPath) return { body: companySettings() };
      if (path.endsWith("/configuration")) {
        return { body: locationManagerConfiguration() };
      }
      if (path === previewPath) {
        return {
          body: {
            count: 1,
            hasMore: false,
            items: [{
              id: "alert-1",
              category: "ALT-08",
              severity: "CRITICAL",
              sourceKind: "INCIDENT",
              sourceId: "incident-1",
              episodeId: "incident-episode-1",
              locationId: location,
              occurredAt: "2026-11-04T09:00:00Z",
              title: "Critical incident needs review",
            }],
          },
        };
      }
      if (path === incidentDetailPath) {
        const episode = new URL(request.url()).searchParams.get("episodeId");
        if (episode !== "incident-episode-1") {
          return {
            status: 404,
            body: {
              code: "AUTHORIZATION_DENIED",
              message: "Unavailable",
              requestId: "e2e-hidden",
            },
          };
        }
        return {
          body: {
            item: {
              id: "alert-1",
              category: "ALT-08",
              severity: "CRITICAL",
              sourceKind: "INCIDENT",
              sourceId: "incident-1",
              episodeId: "incident-episode-1",
              locationId: location,
              occurredAt: "2026-11-04T09:00:00Z",
              title: "Critical incident needs review",
            },
            valetSessionId: null,
          },
        };
      }
      if (path === timingPath) {
        const values = {
          alt01GraceSeconds: grace,
          alt02QueueSeconds: 60,
          alt03DeclineSeconds: 0,
          alt04StageSeconds: 300,
          alt06HandoffSeconds: 300,
          alt11UnknownPaymentSeconds: 120,
        };
        if (request.method() === "PUT") {
          const incoming = request.postDataJSON() as {
            expectedRevision: number;
            values: typeof values;
          };
          if (incoming.expectedRevision !== revision) {
            return {
              status: 409,
              body: {
                code: "MANAGEMENT_ALERT_TIMING_CONFLICT",
                message: "Revision conflict",
                requestId: "e2e-409",
              },
            };
          }
          revision += 1;
          writes += 1;
          grace = incoming.values.alt01GraceSeconds;
        }
        return {
          body: {
            organizationId: org,
            userId: "fixture-own-user",
            revision,
            updatedAt: revision === 0 ? null : "2026-11-04T09:01:00Z",
            values: { ...values, alt01GraceSeconds: grace },
          },
        };
      }
      return undefined;
    },
  });
  return { api, getWrites: () => writes };
}

test("feature OFF preserves frozen topbar and Policies Studio settings", async ({
  page,
}, testInfo) => {
  test.skip(feature, "Feature-on run has its own additive-only checks");
  const fixture = fixtureForAlerts("COMPANY_ADMIN");
  await fixture.api.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.locator(".management-alert-bell")).toHaveCount(0);
  await expect(page.locator(".ps-section-links a[href*='alertsTiming']")).toHaveCount(0);
  expect(fixture.api.count(previewPath)).toBe(0);
  expect(fixture.api.count(timingPath)).toBe(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const variant of ["en-light", "en-dark", "ar-dark", "ar-light"]) {
      if (variant === "en-dark") {
        await page.getByRole("button", { name: "Dark" }).click();
      } else if (variant === "ar-dark") {
        await page.getByRole("button", { name: "Language" }).click();
      } else if (variant === "ar-light") {
        await page.locator(".theme-segment").first().click();
      }
      await expect(page.locator("html")).toHaveAttribute(
        "dir", variant.startsWith("ar") ? "rtl" : "ltr",
      );
      await page.screenshot({
        path: testInfo.outputPath(`frozen-policies-${variant}-${width}.png`),
        animations: "disabled",
        caret: "hide",
        style: noChromeDevIndicator,
      });
    }
    await page.getByRole("button", { name: /Language|اللغة/ }).click();
    await page.locator(".theme-segment").first().click();
  }
});

test("CA personal timing and compact bell support keyboard and responsive EN/AR themes", async ({
  page,
}, testInfo) => {
  test.skip(!feature, "Run with NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE1=enabled");
  test.setTimeout(180_000);
  const fixture = fixtureForAlerts("COMPANY_ADMIN");
  await fixture.api.install(page);
  await page.goto("/policies?section=alertsTiming");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Alert Timing" })).toBeVisible();
  await expect(page.locator(".management-alert-bell")).toBeVisible();
  await expect(page.locator(".management-alert-badge")).toHaveText("1");
  await page.getByRole("spinbutton", { name: "After retrieval SLA breach" })
    .fill("30");
  await page.getByRole("button", { name: "Save my timing" }).click();
  await expect.poll(fixture.getWrites).toBe(1);
  await expect(page.getByText("Personal alert timing saved.")).toBeVisible();

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const variant of ["en-light", "en-dark", "ar-dark", "ar-light"]) {
      if (variant === "en-dark") {
        await page.getByRole("button", { name: "Dark" }).click();
      } else if (variant === "ar-dark") {
        await page.getByRole("button", { name: "Language" }).click();
      } else if (variant === "ar-light") {
        await page.locator(".theme-segment").first().click();
      }
      const ar = variant.startsWith("ar");
      await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
      await page.screenshot({
        path: testInfo.outputPath(`alerts-settings-${variant}-${width}.png`),
        animations: "disabled",
        caret: "hide",
        style: noChromeDevIndicator,
      });
      await openStudioSection(page, "operations");
      await expect(page.getByRole("heading", { name: variant.startsWith("ar")
        ? "عمليات المركبات" : "Vehicle operations" })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`frozen-policies-${variant}-${width}.png`),
        animations: "disabled",
        caret: "hide",
        style: noChromeDevIndicator,
      });
      await openStudioSection(page, "alertsTiming");
      const bell = page.locator(".management-alert-bell");
      await bell.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Critical incident needs review")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(bell).toBeFocused();
    }
    await page.getByRole("button", { name: /Language|اللغة/ }).click();
    await page.locator(".theme-segment").first().click();
  }
  await page.locator(".management-alert-bell").click();
  await page.getByRole("link", { name: "View source details" }).click();
  await expect(page).toHaveURL(/\/incidents\?alertCategory=ALT-08/u);
  const detail = page.getByRole("dialog", { name: "Source alert details" });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("Critical incident needs review")).toBeVisible();
  expect(fixture.api.count(incidentDetailPath)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(page).not.toHaveURL(/alertCategory/u);
});

test("LM gets personal timing without Company notifications policy section", async ({
  page,
}) => {
  test.skip(!feature, "Run with NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE1=enabled");
  const fixture = fixtureForAlerts("LOCATION_MANAGER");
  await fixture.api.install(page);
  await page.goto("/policies?section=alertsTiming");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Alert Timing" })).toBeVisible();
  await expect(page.locator('.ps-section-links a[href*="notifications"]')).toHaveCount(0);
  await expect(page.locator(".management-alert-badge")).toHaveText("1");
});
