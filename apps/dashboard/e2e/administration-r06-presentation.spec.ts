import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
} from "./support/r06-locations";

test("Location master communicates selection and detail shows real identity facts", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === lifecyclePath ? { body: locationLifecycle() } : undefined,
  });
  await fixture.install(page);
  await enterLocations(page);
  await expect(
    page.getByText("Select a Location to view this information."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Location", exact: true }).focus();
  await page.keyboard.press("Tab");
  const keyboardRow = page
    .getByTestId("location-master")
    .getByRole("button", { name: /Main Garage/ });
  await expect(keyboardRow).toBeFocused();
  await expect(keyboardRow).toHaveCSS("outline-style", "solid");
  await keyboardRow.press("Enter");
  await expect(
    page.getByRole("heading", { name: LOCATION_A.name, exact: true }),
  ).toBeVisible();
  const content = page.getByTestId("md02-page");
  const row = content.getByRole("button", { name: /Main Garage/ });
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(row).not.toContainText(LOCATION_A.locationId);
  await expect(
    content.getByText("R06 protected address sentinel", { exact: true }),
  ).toBeVisible();
  await expect(content.getByText("MAIN", { exact: true }).last()).toBeVisible();
  await expect(content.getByText("Asia/Amman", { exact: true })).toBeVisible();
  await expect(content.getByText("JOD", { exact: true })).toBeVisible();
  await expect(content.locator("img")).toHaveCount(0);
  await expect(
    content.getByText(
      /Vehicles Today|Staff Members|Active Zones|Primary Location/,
    ),
  ).toHaveCount(0);
  await expect(
    content.getByRole("button", { name: "Edit Location" }),
  ).toHaveCount(0);
});
