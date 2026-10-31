import { expect, test } from "@playwright/test";

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

const companyPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/settings`;

test("Studio uses authenticated Company settings, server save and browser section history", async ({
  page,
}) => {
  let saved = companySettings();
  let writes = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === companyPath) return { body: saved };
      if (path === `${companyPath}/default` && request.method() === "PUT") {
        const input = request.postDataJSON() as {
          setting: string;
          value: unknown;
          expectedUpdatedAt: string;
        };
        if (
          input.setting !== "checkInPhotosRequired" ||
          input.expectedUpdatedAt !== saved.updatedAt
        ) {
          return {
            status: 409,
            body: {
              code: "SETTINGS_REVISION_CONFLICT",
              message: "Conflict",
              requestId: "test",
            },
          };
        }
        writes++;
        saved = {
          ...saved,
          updatedAt: "2026-09-21T08:00:01.000Z",
          defaults: {
            ...saved.defaults,
            checkInPhotosRequired: input.value === true,
          },
        };
        return { body: saved };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/policies?section=operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();

  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Vehicle operations" }),
  ).toBeVisible();
  await expect(page.locator(".ps-preview-footer")).toHaveCount(0);
  await expect(
    page.locator('[data-setting="checkInPhotosRequired"]'),
  ).toBeVisible();

  await page
    .locator('[data-setting="checkInPhotosRequired"] .ps-edit-button')
    .click();
  await page
    .locator('[data-setting="checkInPhotosRequired"] select')
    .first()
    .selectOption("true");
  await page
    .locator('[data-setting="checkInPhotosRequired"] button[type="submit"]')
    .click();
  await expect.poll(() => writes).toBe(1);
  await expect(
    page.locator(
      '[data-setting="checkInPhotosRequired"] .ps-setting-value strong',
    ),
  ).toHaveText("Yes");

  await page.locator('.ps-section-links a[href*="section=payments"]').click();
  await expect(page).toHaveURL(/section=payments/u);
  await page.goBack();
  await expect(page).toHaveURL(/section=operations/u);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Vehicle operations" }),
  ).toBeVisible();
});

test("Manager sees only authorized Location sections and no WhatsApp controls", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path.endsWith("/configuration")
        ? { body: locationManagerConfiguration() }
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/policies?section=whatsapp&role=COMPANY_ADMIN");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.locator(".ps-workspace")).toBeVisible();
  await expect(
    page.locator('.ps-section-links a[href*="section=whatsapp"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Vehicle operations" }),
  ).toBeVisible();
  expect(fixture.count(companyPath)).toBe(0);
});

test("Existing Service Status query retains read-only legacy route", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path) =>
      path.endsWith("/integrations")
        ? {
            body: {
              organizationId: ORG_A.organizationId,
              integrations: [
                { key: "PLATE_OCR", status: "UNKNOWN" },
                { key: "STAFF_PUSH", status: "DEGRADED" },
                { key: "DIGITAL_PAYMENT", status: "OPERATIONAL" },
              ],
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await page.goto("/policies?tab=services");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: "Service Status" })).toBeVisible();
  await expect(page.getByText("Unknown", { exact: true })).toBeVisible();
  await expect(page.locator(".ps-workspace")).toHaveCount(0);
});
