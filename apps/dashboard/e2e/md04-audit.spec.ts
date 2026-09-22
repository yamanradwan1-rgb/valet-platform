import { expect, test, type Page, type Request } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  md04AuditReply,
  malformedAuditReply,
  organizationEvents,
  supervisorEvent,
} from "./support/md04-audit-fixtures";
import {
  MALICIOUS_SETTING,
  md04FeatureAuthority,
  locationAuditPath,
  orgAuditPath,
} from "./support/md04-fixtures";

async function enterOrganizationAudit(page: Page, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toBeVisible();
}

function auditOverride(role: "CA" | "LM" | "SUPERVISOR") {
  return (path: string, request: Request) => {
    if (path === "/v1/staff/dashboard/feature-authority") {
      return md04FeatureAuthority(request, role);
    }
    return md04AuditReply(path, request, role);
  };
}

test("CA Organization Audit renders only safe typed data, supported filter and opaque cursors", async ({ page }) => {
  const queries: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === orgAuditPath) queries.push(request.url());
      return auditOverride("CA")(path, request);
    },
  });
  await enterOrganizationAudit(page, fixture);
  await expect(page.getByText("Organization Audit", { exact: true })).toBeVisible();
  await expect(page.getByText("ORGANIZATION", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("LOCATION", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Loaded 4 events", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Event type")).toBeVisible();
  await expect(page.getByRole("button", { name: /Export/i })).toHaveCount(0);
  await expect(page.getByLabel(/Severity/i)).toHaveCount(0);
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await expect(page.locator('input[type="search"]')).toHaveCount(0);
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("IP Address");
  expect(body).not.toContain("actor@example.com");
  expect(body).not.toContain("rawMetadata");

  const maliciousRow = page.locator("tbody tr").filter({
    hasText: "LOCATION_CONFIGURATION_OVERRIDE_SET",
  }).nth(1);
  await maliciousRow.getByRole("button", { name: "Inspect" }).click();
  let drawer = page.getByRole("dialog", { name: "Audit Event Details" });
  await expect(drawer.getByText(MALICIOUS_SETTING, { exact: true })).toBeVisible();
  await expect(drawer.locator("img")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Close" }).click();

  const unknownRow = page.locator("tbody tr").filter({ hasText: "UNKNOWN" });
  await unknownRow.getByRole("button", { name: "Inspect" }).click();
  drawer = page.getByRole("dialog", { name: "Audit Event Details" });
  await expect(drawer.getByText("Actor not included for this event")).toBeVisible();
  await expect(drawer.getByText("No safe details are available for this event.")).toBeVisible();
  await expect(drawer.getByText("Membership ID")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("cell", { name: "DASHBOARD_REPORT_EXPORT_GENERATED" })).toBeVisible();
  await expect(page.getByText("Loaded 1 events", { exact: true })).toBeVisible();
  await expect(page.getByText(/Total|Page \d/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Previous", exact: true }).click();

  await page.getByLabel("Event type").selectOption("LOCATION_CONFIGURATION_OVERRIDE_SET");
  await expect(page.getByRole("cell", { name: "LOCATION_CONFIGURATION_OVERRIDE_SET" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  expect(queries.some((url) => url.includes("eventType=LOCATION_CONFIGURATION_OVERRIDE_SET"))).toBe(true);
});

test("malformed Audit response fails closed without raw payload rendering", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === orgAuditPath) return malformedAuditReply();
      return undefined;
    },
  });
  await enterOrganizationAudit(page, fixture);
  await expect(page.getByText("The server returned an invalid audit response.")).toBeVisible();
  await expect(page.getByText("rawSecret")).toHaveCount(0);
});

test("current Audit denial wins between opaque cursor pages", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === orgAuditPath) {
        return new URL(request.url()).searchParams.has("cursor")
          ? { status: 403, body: { code: "AUTHORIZATION_DENIED", message: "denied", requestId: "audit-revoked" } }
          : md04AuditReply(path, request, "CA");
      }
      return undefined;
    },
  });
  await enterOrganizationAudit(page, fixture);
  await expect(page.getByText("Loaded 4 events", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/Current server authority no longer allows/)).toBeVisible();
  await expect(page.getByText("Loaded 4 events", { exact: true })).toHaveCount(0);
});

test("Supervisor Audit uses only exact Location route and omits unshared event-type choices", async ({ page }) => {
  const paths: string[] = [];
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "SUPERVISOR");
      if (path === locationAuditPath) paths.push(path);
      if (path === orgAuditPath) paths.push(path);
      return md04AuditReply(path, request, "SUPERVISOR");
    },
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }).click();
  await expect(page.getByText("VALET_SESSION_PARKED", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Event type")).toHaveCount(0);
  expect(paths).toContain(locationAuditPath);
  expect(paths).not.toContain(orgAuditPath);
});

test("late Audit filter response cannot repaint the newest filter", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path !== orgAuditPath) return undefined;
      const eventType = new URL(request.url()).searchParams.get("eventType");
      if (eventType === "LOCATION_CONFIGURATION_OVERRIDE_SET") {
        return { body: { items: [organizationEvents()[2]], nextCursor: null }, delayMs: 450 };
      }
      if (eventType === "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED") {
        return { body: { items: [organizationEvents()[0]], nextCursor: null } };
      }
      return { body: { items: [supervisorEvent(LOCATION_A.locationId)], nextCursor: null } };
    },
  });
  await enterOrganizationAudit(page, fixture);
  await page.getByLabel("Event type").selectOption("LOCATION_CONFIGURATION_OVERRIDE_SET");
  await page.getByLabel("Event type").selectOption("MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED");
  await expect(page.getByRole("cell", { name: "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED" })).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.getByRole("cell", { name: "LOCATION_CONFIGURATION_OVERRIDE_SET" })).toHaveCount(0);
});

test("Supervisor shift-end denial wins between Audit cursor pages", async ({ page }) => {
  let requests = 0;
  const fixture = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority") {
        return md04FeatureAuthority(request, "SUPERVISOR");
      }
      if (path !== locationAuditPath) return undefined;
      requests += 1;
      if (new URL(request.url()).searchParams.has("cursor")) {
        return {
          status: 403,
          body: { code: "AUTHORIZATION_DENIED", message: "shift ended", requestId: "shift-ended" },
        };
      }
      return { body: { items: [supervisorEvent(LOCATION_A.locationId)], nextCursor: "auditnext1" } };
    },
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }).click();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/Current server authority no longer allows/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "VALET_SESSION_PARKED" })).toHaveCount(0);
  expect(requests).toBeGreaterThanOrEqual(2);
});
