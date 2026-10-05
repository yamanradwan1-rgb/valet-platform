import { expect, test, type Page } from "@playwright/test";

import {
  companySettings,
  locationManagerConfiguration,
  managementLocationSettings,
  SETTINGS_UPDATED_AT,
} from "./support/administration-fixtures";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { companyPolicy, locationPolicy } from "./support/presence-data";

// Legacy validation still gets an authorized projection for the added subsection.
function presenceRead(path: string) {
  if (path.endsWith("/shift-presence/policy"))
    return {
      body: path.includes("/management/") ? companyPolicy() : locationPolicy(),
    };
  if (path.includes("/shift-presence/locations/") && path.endsWith("/policy"))
    return { body: locationPolicy() };
  if (path.includes("/shift-presence/") && /\/(zones|exceptions)$/.test(path))
    return { body: { items: [], nextCursor: null } };
  return undefined;
}

const companySettingsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/settings`;
const companySetPath = `${companySettingsPath}/default`;
const locationSettingsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations/${LOCATION_A.locationId}/settings`;
const locationSetPath = `${locationSettingsPath}/override`;
const lmConfigurationPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/configuration`;
const lmSetPath = `${lmConfigurationPath}/override`;

async function enterCompanyPolicies(
  page: Page,
  exactLocation: boolean,
): Promise<void> {
  await page.goto("/policies");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", {
      name: exactLocation ? LOCATION_A.name : "All Locations",
    })
    .click();
}

test("Company settings catch invalid integer and money without sending a mutation", async ({
  page,
}) => {
  const writes: unknown[] = [];
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === companySettingsPath && request.method() === "GET")
        return { body: companySettings() };
      if (path === companySetPath && request.method() === "PUT") {
        writes.push(request.postDataJSON());
        return { body: companySettings() };
      }
      return presenceRead(path);
    },
  });
  await fixture.install(page);
  await enterCompanyPolicies(page, false);

  const integerRow = page.locator('[data-setting="rawGpsRetentionDays"]');
  await integerRow
    .getByRole("textbox", { name: "Edit Raw GPS retention days" })
    .fill("1.5");
  await integerRow.getByRole("button", { name: "Save" }).click();
  const error = page.getByTestId("md02-page").getByRole("alert");
  await expect(error).toBeVisible();
  expect(writes).toHaveLength(0);

  const moneyRow = page.locator('[data-setting="valetServiceFee"]');
  await moneyRow
    .getByRole("textbox", { name: "Edit Valet service fee" })
    .fill("1.0000");
  await moneyRow.getByRole("button", { name: "Save" }).click();
  await expect(error).toBeVisible();
  expect(writes).toHaveLength(0);

  await moneyRow
    .getByRole("textbox", { name: "Edit Valet service fee" })
    .fill("6.250");
  await moneyRow.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({
    setting: "valetServiceFee",
    value: "6.250",
    expectedUpdatedAt: SETTINGS_UPDATED_AT,
  });
  expect(pageErrors).toEqual([]);
});

test("Company operating hours reject a reversed same-day interval locally", async ({
  page,
}) => {
  let writes = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === companySettingsPath && request.method() === "GET")
        return { body: companySettings() };
      if (path === companySetPath && request.method() === "PUT") writes += 1;
      return presenceRead(path);
    },
  });
  await fixture.install(page);
  await enterCompanyPolicies(page, false);

  const row = page.locator('[data-setting="operatingHours"]');
  await row
    .getByRole("combobox", { name: "Monday status" })
    .selectOption("OPEN");
  await row.getByLabel("Monday opens at").fill("17:00");
  await row.getByLabel("Monday closes at").fill("08:00");
  await row.getByRole("button", { name: "Save" }).click();

  await expect(page.getByTestId("md02-page").getByRole("alert")).toContainText(
    "Operating-hours interval must end after it starts.",
  );
  expect(writes).toBe(0);
});

test("Company Admin Location override validation stays on the shared error path", async ({
  page,
}) => {
  let writes = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === companySettingsPath && request.method() === "GET")
        return { body: companySettings() };
      if (path === locationSettingsPath && request.method() === "GET")
        return { body: managementLocationSettings() };
      if (path === locationSetPath && request.method() === "PUT") writes += 1;
      return presenceRead(path);
    },
  });
  await fixture.install(page);
  await enterCompanyPolicies(page, true);
  await page.getByRole("tab", { name: "Location overrides" }).click();

  const row = page.locator('[data-setting="valetServiceFee"]');
  await row
    .getByRole("textbox", { name: "Edit Valet service fee" })
    .fill("-1.000");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("md02-page").getByRole("alert")).toBeVisible();
  expect(writes).toBe(0);
});

test("Location Manager invalid configuration never reaches the legacy mutation endpoint", async ({
  page,
}) => {
  let writes = 0;
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === lmConfigurationPath && request.method() === "GET")
        return { body: locationManagerConfiguration() };
      if (path === lmSetPath && request.method() === "PUT") writes += 1;
      return presenceRead(path);
    },
  });
  await fixture.install(page);
  await page.goto("/policies");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const row = page.locator('[data-setting="rawGpsRetentionDays"]');
  await row
    .getByRole("textbox", { name: "Edit Raw GPS retention days" })
    .fill("0");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("md02-page").getByRole("alert")).toBeVisible();
  expect(writes).toBe(0);
});
