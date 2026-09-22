import { expect, test, type Page, type Request } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  INACTIVE_LOCATION,
  md04FeatureAuthority,
  type Md04Role,
} from "./support/md04-fixtures";
import { md04AuditReply } from "./support/md04-audit-fixtures";

function override(role: Md04Role) {
  return (path: string, request: Request) => {
    if (path === "/v1/staff/dashboard/feature-authority") {
      return md04FeatureAuthority(request, role);
    }
    return md04AuditReply(path, request, role);
  };
}

async function signInAt(page: Page, path: string, email: string) {
  await page.goto(path);
  await signInOnCurrentPage(page, email);
}

test("CA All Locations keeps both real MD-04 links on ordinary and owned routes", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: override("CA"),
  });
  await fixture.install(page);
  await signInAt(page, "/", "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await expect(nav.getByRole("link", { name: "Visit Contacts" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit Log" })).toBeVisible();

  await nav.getByRole("link", { name: "Visit Contacts" }).click();
  await expect(page.getByRole("heading", { name: "Visit Contacts", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit Log" })).toBeVisible();

  await nav.getByRole("link", { name: "Audit Log" }).click();
  await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Visit Contacts" })).toBeVisible();
});

test("CA exact Location exposes Audit but does not attach Visit Contacts", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: override("CA"),
  });
  await fixture.install(page);
  await signInAt(page, "/audit-log", "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await expect(nav.getByRole("link", { name: "Audit Log" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Visit Contacts" })).toHaveCount(0);
});

test("LM grant set exposes Visit Contacts only; exact active and inactive Locations expose Audit only", async ({ page }) => {
  const locations = [LOCATION_A, INACTIVE_LOCATION as unknown as typeof LOCATION_A];
  const fixture = new DashboardApiFixture({
    locationManagerOrganizations: [ORG_A],
    locationManagerLocations: { [ORG_A.organizationId]: locations },
    override: override("LM"),
  });
  await fixture.install(page);
  await signInAt(page, "/customers", "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByRole("heading", { name: "Visit Contacts", level: 1 })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await expect(nav.getByRole("link", { name: "Visit Contacts" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit Log" })).toHaveCount(0);

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await expect(page.getByRole("link", { name: "Audit Log" })).toHaveCount(0);
  await page.goto("/audit-log");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit Log" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Visit Contacts" })).toHaveCount(0);

  await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: /Historic Garage/ }).click();
  await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toBeVisible();
  await expect(page.getByText("Location Audit", { exact: true })).toBeVisible();
});

test("Supervisor active Shift gets Audit only; ended Shift and Employee get neither product surface", async ({ page }) => {
  const supervisor = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: override("SUPERVISOR"),
  });
  await supervisor.install(page);
  await signInAt(page, "/audit-log", "supervisor@example.com");
  await page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }).click();
  await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await expect(nav.getByRole("link", { name: "Audit Log" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Visit Contacts" })).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  await page.context().clearCookies();
  const ended = new DashboardApiFixture({ operationalContexts: [] });
  await ended.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page, "supervisor-ended@example.com");
  await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  await page.context().clearCookies();
  const employee = new DashboardApiFixture({ operationalContexts: [employeeContext()] });
  await employee.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page, "employee@example.com");
  await expect(page.getByRole("heading", { name: "Visit Contacts", level: 1 })).toHaveCount(0);
  await page.goto("/audit-log");
  await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toHaveCount(0);
});
