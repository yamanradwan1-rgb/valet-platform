import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04FeatureAuthority, orgAuditPath } from "./support/md04-fixtures";
import { organizationEvents } from "./support/md04-audit-fixtures";
import { persistentMatches } from "./support/persistent-storage";

const forbidden = {
  rawMetadata: "R08_FORBIDDEN_METADATA_6321",
  credentials: "R08_FORBIDDEN_CREDENTIAL_6321",
  mfaSecret: "R08_FORBIDDEN_MFA_6321",
  bearerToken: "R08_FORBIDDEN_TOKEN_6321",
  actorEmail: "R08_FORBIDDEN_EMAIL@example.test",
  gps: "R08_FORBIDDEN_GPS_6321",
  providerSecret: "R08_FORBIDDEN_PROVIDER_6321",
  requestBody: "R08_FORBIDDEN_BODY_6321",
};

test("Audit malformed forbidden payload is absent from DOM and all persistent stores", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority")
        return md04FeatureAuthority(request, "CA");
      if (path === orgAuditPath)
        return {
          body: {
            items: [{ ...organizationEvents()[0], ...forbidden }],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  await expect(
    page.getByText("The server returned an invalid audit response."),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  for (const sentinel of Object.values(forbidden)) {
    expect(
      await page.locator("html").evaluate((node) => node.outerHTML),
    ).not.toContain(sentinel);
    expect(await persistentMatches(page, sentinel)).toEqual({
      local: [],
      session: [],
      indexed: [],
      cache: [],
    });
  }
});

for (const code of [
  "VALIDATION_ERROR",
  "AUTHORIZATION_DENIED",
  "MANAGEMENT_ENTITLEMENT_REQUIRED",
]) {
  test(`Audit cursor ${code} removes rows and Inspect`, async ({ page }) => {
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) => {
        if (path === "/v1/staff/dashboard/feature-authority")
          return md04FeatureAuthority(request, "CA");
        if (path !== orgAuditPath) return undefined;
        return new URL(request.url()).searchParams.has("cursor")
          ? {
              status: code === "VALIDATION_ERROR" ? 400 : 403,
              body: { code, message: "denied", requestId: "r08-denial" },
            }
          : { body: { items: organizationEvents(), nextCursor: "r08next1" } };
      },
    });
    await fixture.install(page);
    await page.goto("/audit-log");
    await signInOnCurrentPage(page);
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page
      .getByRole("button", { name: "All Locations", exact: true })
      .click();
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Retry" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
