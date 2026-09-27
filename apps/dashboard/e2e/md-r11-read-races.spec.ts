import { expect, test, type Page } from "@playwright/test";
import {
  companySettings,
  managementLocationSettings,
} from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { r11Base, r11Branding } from "./support/md-r11-fixtures";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function changeScope(
  page: Page,
  organization = ORG_A,
  location = LOCATION_A,
) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope" })
    .click();
  await page.getByRole("button", { name: organization.name }).click();
  await page.getByRole("button", { name: location.name }).click();
}

for (const feature of ["settings", "branding"] as const) {
  test(`R11 ${feature} Company→Location→Company rejects stale tab success`, async ({
    page,
  }) => {
    const companyTab =
      feature === "settings" ? "Company defaults" : "Company branding";
    const locationTab =
      feature === "settings" ? "Location overrides" : "Location branding";
    const pending = gate();
    let delayCompany = false;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: async (path) => {
        if (path === `${r11Base}/${feature}`) {
          const delayed = delayCompany;
          if (delayed) await pending.promise;
          return {
            body:
              feature === "settings"
                ? {
                    ...companySettings(),
                    defaults: {
                      ...companySettings().defaults,
                      rawGpsRetentionDays: delayed ? 99 : 30,
                    },
                  }
                : {
                    ...r11Branding,
                    displayName: delayed ? "Stale company" : "Current company",
                  },
          };
        }
        if (
          path === `${r11Base}/locations/${LOCATION_A.locationId}/${feature}`
        ) {
          if (feature === "settings")
            return { body: managementLocationSettings() };
          const inherited = (value: string) => ({
            default: value,
            overridePresent: false,
            override: null,
            effective: value,
          });
          return {
            body: {
              ...r11Branding,
              locationId: LOCATION_A.locationId,
              displayName: inherited("Location"),
              primaryColor: inherited("#176BFF"),
            },
          };
        }
        return undefined;
      },
    });
    await fixture.install(page);
    await page.goto(feature === "settings" ? "/policies" : "/branding");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    const input =
      feature === "settings"
        ? page.locator("#setting-rawGpsRetentionDays")
        : page.getByLabel("Display name");
    await expect(input).toHaveValue(
      feature === "settings" ? "30" : "Current company",
    );
    await page.getByRole("tab", { name: locationTab }).click();
    await expect(input).toBeVisible();
    delayCompany = true;
    const started = page.waitForRequest(
      (r) => new URL(r.url()).pathname === `${r11Base}/${feature}`,
    );
    await page.getByRole("tab", { name: companyTab }).click();
    await started;
    await page.getByRole("tab", { name: locationTab }).click();
    await expect(input).toBeVisible();
    delayCompany = false;
    await page.getByRole("tab", { name: companyTab }).click();
    await expect(input).toHaveValue(
      feature === "settings" ? "30" : "Current company",
    );
    pending.release();
    await page.waitForTimeout(100);
    await expect(input).toHaveValue(
      feature === "settings" ? "30" : "Current company",
    );
  });
}

test("R11 exact Location A→B→A rejects a pending first-A settings response", async ({
  page,
}) => {
  const pending = gate();
  let stale = true;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
    override: async (path) => {
      if (path === `${r11Base}/settings`) return { body: companySettings() };
      const location = [LOCATION_A, LOCATION_B].find(
        (l) => path === `${r11Base}/locations/${l.locationId}/settings`,
      );
      if (!location) return undefined;
      const delayed = stale && location === LOCATION_A;
      if (delayed) await pending.promise;
      const body = managementLocationSettings();
      return {
        body: {
          ...body,
          locationId: location.locationId,
          settings: {
            ...body.settings,
            rawGpsRetentionDays: {
              default: 30,
              overridePresent: true,
              override: delayed ? 99 : 45,
              effective: delayed ? 99 : 45,
            },
          },
        },
      };
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  const started = page.waitForRequest((r) =>
    r.url().endsWith(`/locations/${LOCATION_A.locationId}/settings`),
  );
  await page.getByRole("tab", { name: "Location overrides" }).click();
  await started;
  await changeScope(page, ORG_A, LOCATION_B);
  await page.getByRole("tab", { name: "Location overrides" }).click();
  await expect(page.locator("#setting-rawGpsRetentionDays")).toHaveValue("45");
  stale = false;
  await changeScope(page);
  await page.getByRole("tab", { name: "Location overrides" }).click();
  await expect(page.locator("#setting-rawGpsRetentionDays")).toHaveValue("45");
  pending.release();
  await page.waitForTimeout(100);
  await expect(page.locator("#setting-rawGpsRetentionDays")).toHaveValue("45");
});

test("R11 Billing Organization A→B→A never repaints the first-A payload", async ({
  page,
}) => {
  const pending = gate();
  const businessReadStarted = gate();
  let delay = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    override: async (path) => {
      const organization = [ORG_A, ORG_B].find(
        (o) =>
          path ===
          `/v1/staff/management/organizations/${o.organizationId}/subscription`,
      );
      if (!organization) return undefined;
      // Scope discovery and revalidation use the same endpoint. Delay only
      // the mounted page's business read, after the authorized shell exists.
      const delayed =
        delay &&
        organization === ORG_A &&
        (await page.locator(".topbar").count()) > 0;
      if (delayed) {
        businessReadStarted.release();
        await pending.promise;
      }
      return {
        body: {
          organizationId: organization.organizationId,
          subscription: {
            planCode: delayed
              ? "STALE_FIRST_A"
              : `CURRENT_${organization === ORG_A ? "A" : "B"}`,
            status: "ACTIVE",
            entitlements: {
              dashboardAccess: true,
              reportExports: true,
              basicBranding: true,
            },
          },
        },
      };
    },
  });
  await fixture.install(page);
  await page.goto("/billing-subscription");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByText("CURRENT_A", { exact: true })).toBeVisible();
  const choose = async (organization: typeof ORG_A) => {
    await page
      .locator(".topbar")
      .getByRole("button", { name: "Change scope" })
      .click();
    await page.getByRole("button", { name: organization.name }).click();
  };
  await choose(ORG_B);
  await expect(page.getByText("CURRENT_B", { exact: true })).toBeVisible();
  delay = true;
  await choose(ORG_A);
  await businessReadStarted.promise;
  await expect(
    page.getByRole("heading", { name: "Billing & Subscription" }),
  ).toBeVisible();
  await choose(ORG_B);
  await expect(page.getByText("CURRENT_B", { exact: true })).toBeVisible();
  delay = false;
  await choose(ORG_A);
  await expect(page.getByText("CURRENT_A", { exact: true })).toBeVisible();
  pending.release();
  await page.waitForTimeout(100);
  await expect(page.getByText("CURRENT_A", { exact: true })).toBeVisible();
  await expect(page.getByText("STALE_FIRST_A", { exact: true })).toHaveCount(0);
});
