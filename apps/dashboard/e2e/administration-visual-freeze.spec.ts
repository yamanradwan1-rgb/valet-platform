import { expect, test } from "@playwright/test";

import {
  companySettings,
  integrationsProjection,
  staffDirectoryItem,
} from "./support/administration-fixtures";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";

test("MD-02 pages preserve the frozen reference hierarchy and page-specific geometry", async ({ page }) => {
  const staffPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/staff`;
  const settingsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/settings`;
  const brandingPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/branding`;
  const integrationsPath = `/v1/staff/management/organizations/${ORG_A.organizationId}/integrations`;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === staffPath && request.method() === "GET") {
        return { body: { items: [staffDirectoryItem()], nextCursor: null } };
      }
      if (path === settingsPath && request.method() === "GET") return { body: companySettings() };
      if (path === brandingPath && request.method() === "GET") {
        return {
          body: {
            organizationId: ORG_A.organizationId,
            updatedAt: "2026-09-21T10:00:00.000Z",
            displayName: "VAYLET",
            primaryColor: "#1E60F0",
          },
        };
      }
      if (path === integrationsPath && request.method() === "GET") return { body: integrationsProjection() };
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();

  const navigation = page.getByRole("navigation", { name: "Management navigation" });
  const employeeTitle = page.getByRole("heading", { name: "Employees & Shifts", level: 1 });
  await expect(employeeTitle).toHaveCSS("font-size", "24px");
  await expect(employeeTitle).toHaveCSS("font-weight", "700");
  await expect(page.getByText("Manage your team and shifts.")).toHaveCSS("font-size", "14px");
  const employeeHeader = page.getByRole("columnheader", { name: "Email" });
  await expect(employeeHeader).toHaveCSS("color", "rgb(15, 23, 42)");
  await expect(employeeHeader).toHaveCSS("font-weight", "600");
  const employeeTab = page.getByRole("button", { name: "Employees" });
  await expect(employeeTab).toHaveCSS("font-weight", "600");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(employeeHeader).toHaveCSS("color", "rgb(226, 232, 240)");
  await expect(employeeTab).toHaveCSS("color", "rgb(56, 189, 248)");
  const employeeCard = employeeHeader.locator("xpath=ancestor::table/ancestor::div[2]");
  await expect(employeeCard).toHaveCSS("border-color", "rgb(23, 35, 70)");
  await page.getByRole("button", { name: "Light" }).click();

  await navigation.getByRole("link", { name: "Locations" }).click();
  const locationsTitle = page.getByRole("heading", { name: "Locations", level: 1 });
  await expect(locationsTitle).toHaveCSS("font-weight", "700");
  await expect(page.getByText("Manage locations and their lifecycle.")).toHaveCSS("font-size", "14px");
  const locationButton = page.getByRole("button", { name: /Main Garage/u });
  const locationIcon = locationButton.locator("span").first();
  await expect(locationIcon).toHaveCSS("width", "32px");
  await expect(locationIcon).toHaveCSS("height", "32px");
  await expect(locationIcon).toHaveCSS("border-radius", "8px");
  await expect(locationIcon).toHaveCSS("background-color", "rgb(241, 245, 249)");
  await locationButton.click();
  await expect(locationIcon).toHaveCSS("background-color", "rgb(30, 96, 240)");
  await expect(locationIcon).toHaveCSS("color", "rgb(255, 255, 255)");

  await navigation.getByRole("link", { name: "Policies & Settings" }).click();
  await expect(page.getByRole("heading", { name: "Policies & Settings", level: 1 })).toHaveCSS("font-weight", "700");
  await expect(page.getByText("Manage typed operational configuration.")).toHaveCSS("font-size", "14px");
  const policiesTab = page.getByRole("tab", { name: "Company defaults" });
  await expect(policiesTab).toHaveCSS("padding-bottom", "12px");
  await expect(policiesTab.locator("..")).toHaveCSS("border-bottom-color", "rgb(241, 245, 249)");
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.getByRole("tab", { name: "Location overrides" })).toHaveCSS("color", "rgb(148, 163, 184)");
  await page.getByRole("button", { name: "Light" }).click();

  await navigation.getByRole("link", { name: "Roles & Permissions" }).click();
  await expect(page.getByRole("heading", { name: "Roles & Permissions", level: 1 })).toHaveCSS("font-weight", "700");
  await expect(page.getByText("Review the fixed VAYLET staff roles.")).toHaveCSS("font-size", "14px");
  const adminRow = page.getByRole("row").filter({ hasText: "Company Admin" });
  const roleCell = adminRow.getByRole("cell").first().locator("div").first();
  await expect(roleCell).toHaveCSS("gap", "12px");
  await expect(roleCell.locator("span").first()).toHaveCSS("width", "32px");
  await expect(adminRow.getByText("ORG_ADMIN", { exact: true })).toHaveCount(0);

  await navigation.getByRole("link", { name: "Branding" }).click();
  const brandLabel = page.locator('label[for="brand-display-name"]');
  const brandInput = page.getByLabel("Display name");
  await expect(brandLabel).toHaveCSS("font-size", "12px");
  await expect(brandLabel).toHaveCSS("font-weight", "600");
  await expect(brandInput).toHaveCSS("font-size", "14px");
  await expect(brandInput).toHaveCSS("border-radius", "8px");
  await expect(brandInput).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await brandInput.fill("VAYLET Jordan");
  const brandSave = page.getByRole("button", { name: "Save Display name" });
  await expect(brandSave).toHaveCSS("font-size", "14px");
  await expect(brandSave).toHaveCSS("font-weight", "500");
  await brandSave.hover();
  await expect(brandSave).toHaveCSS("background-color", "rgb(21, 81, 202)");
  await brandSave.focus();
  await expect(brandSave).toHaveCSS("outline-color", "rgb(30, 96, 240)");

  await navigation.getByRole("link", { name: "Integrations" }).click();
  await expect(page.getByRole("heading", { name: "Integrations & Connectors", level: 1 })).toHaveCSS("font-weight", "700");
  await expect(page.getByText("View the current production integration status.")).toHaveCSS("font-size", "12px");
  const plateFilter = page.getByRole("button", { name: "Plate OCR" });
  await expect(plateFilter).toHaveCSS("font-weight", "500");
  await expect(plateFilter).toHaveCSS("background-color", "rgb(241, 245, 249)");
  const integrationCard = page.getByText("PLATE_OCR", { exact: true }).locator('xpath=ancestor::div[contains(@class,"integrationCard")]');
  await expect(integrationCard.locator("span").first()).toHaveCSS("width", "40px");
  await expect(integrationCard.locator("span").first()).toHaveCSS("border-radius", "8px");
  await expect(integrationCard.locator("span").first().locator("svg")).toHaveCSS("color", "rgb(244, 63, 94)");
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCSS("font-size", "14px");

  await navigation.getByRole("link", { name: "Billing & Subscription" }).click();
  await expect(page.getByRole("heading", { name: "Billing & Subscription", level: 1 })).toHaveCSS("font-weight", "700");
  await expect(page.getByText("View the persisted plan, status, and entitlements.")).toHaveCSS("font-size", "12px");
  const planCard = page.getByText("Plan code", { exact: true }).locator("..");
  await expect(planCard).toHaveCSS("padding", "24px");
  const entitlementsHeader = page.getByRole("columnheader", { name: "Entitlements" });
  await expect(entitlementsHeader).toHaveCSS("padding-top", "12px");
  await expect(entitlementsHeader).toHaveCSS("padding-left", "16px");
  await expect(entitlementsHeader).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(entitlementsHeader).toHaveCSS("color", "rgb(148, 163, 184)");
});
