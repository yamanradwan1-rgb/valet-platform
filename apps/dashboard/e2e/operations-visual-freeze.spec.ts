import { expect, test } from "@playwright/test";

import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { operationsReadReply } from "./support/operations-fixtures";

test("MD-03 six pages preserve the frozen reference hierarchy, geometry, and dark palette", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) => operationsReadReply(path),
  });
  await fixture.install(page);
  await page.goto("/live-operations");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();

  const title = page.getByRole("heading", { name: "Live Operations", level: 1 });
  await expect(title).toHaveCSS("font-size", "24px");
  await expect(title).toHaveCSS("font-weight", "700");
  await expect(page.getByText("Current exact-Location valet operations.")).toHaveCSS("font-size", "14px");
  const activeCard = page.getByText("Active Sessions").locator("..").locator("..");
  await expect(activeCard).toHaveCSS("border-radius", "12px");
  await expect(activeCard.locator("div").first()).toHaveCSS("width", "48px");
  const liveHeader = page.getByRole("columnheader", { name: "Vehicle" });
  await expect(liveHeader).toHaveCSS("padding-top", "14px");
  await expect(liveHeader).toHaveCSS("padding-left", "24px");
  await expect(liveHeader).toHaveCSS("font-weight", "600");
  await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCSS("text-align", "end");
  await expect(page.getByRole("tab", { name: /All \(/u })).toHaveAttribute("aria-selected", "true");
  const metricGrid = activeCard.locator("..");
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(async () => (await metricGrid.evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(" ").length
  ))).toBe(2);
  await page.setViewportSize({ width: 1280, height: 900 });

  const nav = page.getByRole("navigation", { name: "Management navigation" });
  await nav.getByRole("link", { name: "Vehicles" }).click();
  await expect(page.getByRole("heading", { name: "Vehicles", level: 1 })).toHaveCSS("font-size", "24px");
  const vehicleHeader = page.getByRole("columnheader", { name: "Plate / Descriptor" });
  await expect(vehicleHeader).toHaveCSS("padding-left", "20px");
  await expect(vehicleHeader).toHaveCSS("background-color", "rgb(250, 251, 253)");
  await expect(page.locator('[class*="searchPlaceholder"]')).toHaveCSS("min-height", "42px");
  await expect(page.locator('[class*="filterPlaceholder"]').first()).toHaveCSS("min-height", "36px");
  await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCSS("text-align", "end");

  await nav.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toHaveCSS("font-weight", "700");
  await expect(page.getByRole("columnheader", { name: "Task" })).toHaveCSS("padding-left", "24px");
  await expect(page.locator('[class*="filterPlaceholder"]')).toHaveCount(3);

  await nav.getByRole("link", { name: "Keys" }).click();
  await expect(page.getByRole("heading", { name: "Keys", level: 1 })).toHaveCSS("font-size", "24px");
  await expect(page.locator('[class*="filterPlaceholder"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Previous" })).toHaveCSS("width", "32px");
  await expect(page.getByRole("button", { name: "Previous" })).toHaveCSS("height", "32px");

  await nav.getByRole("link", { name: "Incidents" }).click();
  await expect(page.getByRole("heading", { name: "Incidents", level: 1 })).toHaveCSS("font-weight", "700");
  const incidentHeader = page.getByRole("columnheader", { name: "Description" });
  await expect(incidentHeader).toHaveCSS("padding-top", "14px");
  await expect(incidentHeader).toHaveCSS("padding-left", "20px");
  await expect(page.locator('[class*="incidentFilterPlaceholder"]')).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Previous" })).toHaveCSS("width", "28px");

  await nav.getByRole("link", { name: "Maps & Zones" }).click();
  await expect(page.getByRole("heading", { name: "Maps & Zones", level: 1 })).toHaveCSS("font-size", "24px");
  await expect(page.getByTestId("md03-page")).toHaveCSS("row-gap", "20px");
  const canvas = page.getByTestId("coordinate-canvas");
  await expect(canvas).toHaveCSS("min-height", "480px");
  await expect(canvas).toHaveCSS("border-radius", "12px");
  await expect(canvas.locator("svg")).toHaveCSS("height", "480px");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(title).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Maps & Zones", level: 1 })).toHaveCSS("color", "rgb(255, 255, 255)");
  const mapToolbar = page.locator('[class*="mapsToolbar"]');
  await expect(mapToolbar).toHaveCSS("background-color", "rgb(14, 22, 49)");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "الخرائط والمناطق", level: 1 })).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
});
