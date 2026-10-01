import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  employeeContext,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { keyItem, incidentItem } from "./support/operations-fixtures";
import { r08Path } from "./support/r08-accountability";
import {
  INACTIVE_LOCATION,
  inactiveAuditPath,
  locationAuditPath,
  md04FeatureAuthority,
  orgAuditPath,
} from "./support/md04-fixtures";
import { md04AuditReply } from "./support/md04-audit-fixtures";

for (const family of ["keys", "incidents"] as const) {
  test(`${family} LM exact grant allows a bounded read`, async ({ page }) => {
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) =>
        path === r08Path(family)
          ? {
              body: {
                items: [family === "keys" ? keyItem() : incidentItem()],
                nextCursor: null,
              },
            }
          : undefined,
    });
    await fixture.install(page);
    await page.goto(`/${family}`);
    await signInOnCurrentPage(page, "manager@example.com");
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page.getByRole("button", { name: LOCATION_A.name }).click();
    await expect(page.getByRole("table")).toBeVisible();
    expect(fixture.count(r08Path(family))).toBeGreaterThan(0);
  });

  for (const selection of ["All Locations", "inactive"] as const) {
    test(`${family} ${selection} makes no business request`, async ({
      page,
    }) => {
      const fixture = new DashboardApiFixture({
        companyOrganizations: [ORG_A],
        companyLocations: { [ORG_A.organizationId]: [INACTIVE_LOCATION] },
      });
      await fixture.install(page);
      await page.goto(`/${family}`);
      await signInOnCurrentPage(page);
      await page.getByRole("button", { name: ORG_A.name }).click();
      await page
        .getByRole("button", {
          name: selection === "inactive" ? /Historic Garage/u : "All Locations",
        })
        .click();
      await expect(
        page.getByText(
          "Select an active exact Location to view this information.",
        ),
      ).toBeVisible();
      expect(
        [...fixture.counts.keys()].filter((path) =>
          path.endsWith(`/overview/${family}`),
        ),
      ).toEqual([]);
    });
  }

  test(`${family} Supervisor does not gain page ownership`, async ({
    page,
  }) => {
    const fixture = new DashboardApiFixture({
      operationalContexts: [supervisorContext()],
    });
    await fixture.install(page);
    await page.goto(`/${family}`);
    await signInOnCurrentPage(page, "supervisor@example.com");
    await expect(
      page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: family === "keys" ? "Keys & Spots" : "Incidents",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
    expect(fixture.count(r08Path(family))).toBe(0);
  });
}

for (const route of ["keys", "incidents", "audit-log"] as const) {
  test(`${route} unauthenticated/guest has no staff read`, async ({ page }) => {
    const fixture = new DashboardApiFixture();
    await fixture.install(page);
    await page.goto(`/${route}`);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(
      [...fixture.counts.keys()].filter(
        (path) => path.includes("/overview/") || path.endsWith("/audit-events"),
      ),
    ).toEqual([]);
  });
  test(`${route} Employee has no Management read`, async ({ page }) => {
    const fixture = new DashboardApiFixture({
      operationalContexts: [employeeContext()],
    });
    await fixture.install(page);
    await page.goto(`/${route}`);
    await signInOnCurrentPage(page, "employee@example.com");
    await expect(page.getByRole("table")).toHaveCount(0);
    expect(
      [...fixture.counts.keys()].filter(
        (path) => path.includes("/overview/") || path.endsWith("/audit-events"),
      ),
    ).toEqual([]);
  });
}

for (const historic of [false, true]) {
  test(`LM Audit exact ${historic ? "historical inactive" : "active"} Location remains available`, async ({
    page,
  }) => {
    const location = historic ? INACTIVE_LOCATION : LOCATION_A;
    const fixture = new DashboardApiFixture({
      locationManagerOrganizations: [ORG_A],
      locationManagerLocations: { [ORG_A.organizationId]: [location] },
      override: (path, request) =>
        path === "/v1/staff/dashboard/feature-authority"
          ? md04FeatureAuthority(request, "LM")
          : md04AuditReply(path, request, "LM"),
    });
    await fixture.install(page);
    await page.goto("/audit-log");
    await signInOnCurrentPage(page, "manager@example.com");
    await page.getByRole("button", { name: ORG_A.name }).click();
    await page
      .getByRole("button", { name: new RegExp(location.name, "u") })
      .click();
    await expect(page.getByRole("table")).toContainText(
      "Location configuration override set",
    );
    await expect(page.getByRole("table")).toContainText(location.name);
    expect(
      fixture.count(historic ? inactiveAuditPath : locationAuditPath),
    ).toBeGreaterThan(0);
    expect(fixture.count(orgAuditPath)).toBe(0);
  });
}

for (const family of ["keys", "incidents"] as const) {
  for (const code of [
    "AUTHORIZATION_DENIED",
    "MANAGEMENT_ENTITLEMENT_REQUIRED",
    "VALIDATION_ERROR",
  ]) {
    test(`${family} cursor ${code} clears protected rows`, async ({ page }) => {
      const fixture = new DashboardApiFixture({
        companyOrganizations: [ORG_A],
        companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
        override: (path, request) => {
          if (path !== r08Path(family)) return undefined;
          if (new URL(request.url()).searchParams.has("cursor"))
            return {
              status: code === "VALIDATION_ERROR" ? 400 : 403,
              body: { code, message: "denied", requestId: "r08-denial" },
            };
          return {
            body: {
              items: [family === "keys" ? keyItem() : incidentItem()],
              nextCursor: "r08next1",
            },
          };
        },
      });
      await fixture.install(page);
      await page.goto(`/${family}`);
      await signInOnCurrentPage(page);
      await page.getByRole("button", { name: ORG_A.name }).click();
      await page.getByRole("button", { name: LOCATION_A.name }).click();
      await expect(page.getByRole("table")).toBeVisible();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Retry" }),
      ).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  }
}
