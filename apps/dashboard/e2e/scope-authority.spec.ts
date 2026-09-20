import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { expectMd01NavigationOnly, signIn } from "./support/foundation-ui";

test("Company Admin can enter All Locations and an exact Location", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await signIn(page);

  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(
    page.getByRole("heading", { name: "Authorized workspace" }),
  ).toBeVisible();
  await expect(page.getByText(`Organization: ${ORG_A.name}`)).toBeVisible();
  await expect(page.getByText(`Location: ${LOCATION_A.name}`)).toHaveCount(0);

  await page.getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByText(`Location: ${LOCATION_A.name}`)).toBeVisible();
});

test("Location Manager sees only granted Locations", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
  });
  await fixture.install(page);
  await signIn(page, "manager@example.com");

  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(
    page.getByRole("button", { name: LOCATION_A.name }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: LOCATION_B.name })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(
    page.getByRole("heading", { name: "Authorized workspace" }),
  ).toBeVisible();
});

test("Supervisor enters one active-shift Location with narrow navigation", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
  });
  await fixture.install(page);
  await signIn(page, "supervisor@example.com");

  await page
    .getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` })
    .click();
  await expect(
    page.getByRole("heading", { name: "Authorized workspace" }),
  ).toBeVisible();
  await expect(page.getByText(`Location: ${LOCATION_A.name}`)).toBeVisible();
  await expectMd01NavigationOnly(page);
});

test("Employee has no general Management workspace", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [employeeContext()],
  });
  await fixture.install(page);
  await signIn(page, "employee@example.com");

  await expect(
    page.getByText(
      "No eligible Management workspace is available for this Staff session.",
    ),
  ).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: "Authorized workspace", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Management navigation" }),
  ).toHaveCount(0);
});

test("Employee direct Help route does not expose protected Help content", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    operationalContexts: [employeeContext()],
  });
  await fixture.install(page);
  await page.goto("/help");
  await page.getByLabel("Email").fill("employee@example.com");
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", { name: "Help and product guidance" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
});

test("Company Admin subscription recovery remains available when Dashboard access is disabled", async ({
  page,
}) => {
  const subscriptionPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/subscription`;
  const locationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === subscriptionPath
        ? {
            body: {
              organizationId: ORG_A.organizationId,
              subscription: {
                planCode: "E2E",
                status: "ACTIVE",
                entitlements: {
                  dashboardAccess: false,
                  reportExports: true,
                  basicBranding: true,
                },
              },
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await signIn(page);
  await page.getByRole("button", { name: ORG_A.name }).click();

  await expect(
    page.getByText(
      "Management Dashboard access is unavailable for this authorized scope.",
    ),
  ).toBeVisible();
  expect(fixture.count(subscriptionPath)).toBe(1);
  expect(fixture.count(locationsPath)).toBe(0);
});

test("a delayed old organization response cannot replace the newer selection", async ({
  page,
}) => {
  const oldLocationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [LOCATION_A],
      [ORG_B.organizationId]: [LOCATION_B],
    },
    override: (path) =>
      path === oldLocationsPath
        ? { body: { items: [LOCATION_A], nextCursor: null }, delayMs: 450 }
        : undefined,
  });
  await fixture.install(page);
  await signIn(page);

  const oldRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === oldLocationsPath,
  );
  await page.getByRole("button", { name: ORG_A.name }).click();
  await oldRequest;
  const newLocationsPath = `/v1/staff/management/organizations/${ORG_B.organizationId}/locations`;
  const newRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === newLocationsPath,
  );
  await page.getByRole("button", { name: ORG_B.name }).evaluate((button) => {
    const key = Object.keys(button).find((candidate) =>
      candidate.startsWith("__reactProps$"),
    );
    if (!key)
      throw new Error(
        "React props were not available for the E2E race injection.",
      );
    const props = (
      button as unknown as Record<string, { onClick?: () => void }>
    )[key];
    if (typeof props?.onClick !== "function")
      throw new Error("Organization click handler was unavailable.");
    props.onClick();
  });
  await newRequest;

  await expect(
    page.getByRole("button", { name: LOCATION_B.name }),
  ).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.getByRole("button", { name: LOCATION_A.name })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: `${ORG_B.name} · Locations` }),
  ).toBeVisible();
});
