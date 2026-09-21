import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  ORG_B,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

const fixturePath = "/foundation-test-subscription-recovery";

function subscription(organizationId: string, locationId?: string) {
  return {
    organizationId,
    ...(locationId === undefined ? {} : { locationId }),
    subscription: {
      planCode: "RECOVERY",
      status: "ACTIVE",
      entitlements: {
        dashboardAccess: false,
        reportExports: true,
        basicBranding: true,
      },
    },
  };
}

test("CA subscription recovery mounts without D-access, context, or Location enumeration", async ({
  page,
}) => {
  const subscriptionPath =
    "/v1/staff/management/organizations/" + ORG_A.organizationId + "/subscription";
  const contextPath =
    "/v1/staff/management/organizations/" + ORG_A.organizationId + "/context";
  const locationsPath =
    "/v1/staff/management/organizations/" + ORG_A.organizationId + "/locations";
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === subscriptionPath
        ? { body: subscription(ORG_A.organizationId) }
        : undefined,
  });
  await fixture.install(page);
  await page.goto(fixturePath);
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();

  await expect(
    page.getByRole("heading", { name: "Subscription recovery fixture" }),
  ).toBeVisible();
  await expect(page.getByTestId("recovery-authority")).toHaveText(
    "COMPANY_ADMIN_SUBSCRIPTION",
  );
  await expect(page.getByTestId("recovery-organization")).toHaveText(
    ORG_A.organizationId,
  );
  expect(fixture.count(subscriptionPath)).toBe(2);
  expect(fixture.count(contextPath)).toBe(0);
  expect(fixture.count(locationsPath)).toBe(0);
  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  await expect(navigation.getByRole("link", { name: "Billing & Subscription" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Locations" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Branding" })).toHaveCount(0);
});

test("LM subscription recovery mounts only after an exact active granted Location", async ({
  page,
}) => {
  const subscriptionPath =
    "/v1/staff/dashboard/locations/" + LOCATION_A.locationId + "/subscription";
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === subscriptionPath
        ? { body: subscription(ORG_A.organizationId, LOCATION_A.locationId) }
        : undefined,
  });
  await fixture.install(page);
  await page.goto(fixturePath);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  await expect(
    page.getByRole("heading", { name: "Subscription recovery fixture" }),
  ).toBeVisible();
  await expect(page.getByTestId("recovery-authority")).toHaveText(
    "LOCATION_MANAGER",
  );
  expect(fixture.count(subscriptionPath)).toBe(1);
});

test("LM inactive Location cannot enter subscription recovery", async ({ page }) => {
  const locationsPath =
    "/v1/staff/dashboard/organizations/" + ORG_A.organizationId + "/locations";
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: [] },
    override: (path) =>
      path === locationsPath
        ? {
            body: {
              items: [{ ...LOCATION_A, status: "INACTIVE" }],
              nextCursor: null,
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await page.goto(fixturePath);
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();

  await expect(page.getByRole("button", { name: /Main Garage/u })).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Subscription recovery fixture" }),
  ).toHaveCount(0);
});

for (const [email, operationalContext] of [
  ["supervisor@example.com", supervisorContext()],
  ["employee@example.com", employeeContext()],
] as const) {
  test(`${email} cannot enter subscription recovery`, async ({ page }) => {
    const fixture = new DashboardApiFixture({
      operationalContexts: [operationalContext],
    });
    await fixture.install(page);
    await page.goto(fixturePath);
    await signInOnCurrentPage(page, email);

    await expect(
      page.getByRole("heading", { name: "Subscription recovery fixture" }),
    ).toHaveCount(0);
    expect(fixture.count("/v1/staff/operational-context")).toBe(0);
  });
}

test("a stale CA organization response cannot authorize the old recovery scope", async ({
  page,
}) => {
  const oldSubscription =
    "/v1/staff/management/organizations/" + ORG_A.organizationId + "/subscription";
  const newSubscription =
    "/v1/staff/management/organizations/" + ORG_B.organizationId + "/subscription";
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    override: (path) => {
      if (path === oldSubscription) {
        return { body: subscription(ORG_A.organizationId), delayMs: 450 };
      }
      if (path === newSubscription) {
        return { body: subscription(ORG_B.organizationId) };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto(fixturePath);
  await signInOnCurrentPage(page);

  const oldRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === oldSubscription,
  );
  await page.getByRole("button", { name: ORG_A.name }).click();
  await oldRequest;
  await page.getByRole("button", { name: ORG_B.name }).evaluate((button) => {
    const key = Object.keys(button).find((candidate) =>
      candidate.startsWith("__reactProps$"),
    );
    if (!key) throw new Error("React props unavailable for recovery race test.");
    const props = (
      button as unknown as Record<string, { onClick?: () => void }>
    )[key];
    if (typeof props?.onClick !== "function") {
      throw new Error("Organization click handler unavailable.");
    }
    props.onClick();
  });

  await expect(
    page.getByRole("heading", { name: "Subscription recovery fixture" }),
  ).toBeVisible();
  await expect(page.getByTestId("recovery-organization")).toHaveText(
    ORG_B.organizationId,
  );
  await page.waitForTimeout(550);
  await expect(page.getByTestId("recovery-organization")).toHaveText(
    ORG_B.organizationId,
  );
});
