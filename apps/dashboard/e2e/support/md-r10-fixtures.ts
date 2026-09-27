import { expect, type Page } from "@playwright/test";
import { DashboardApiFixture, ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
import {
  customerHistoryPath,
  historyReply,
  md04FeatureAuthority,
  vehicleHistoryPath,
  visitSearchPath,
  visitSearchReply,
} from "./md04-fixtures";

export async function enterR10Contacts(page: Page) {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority")
        return md04FeatureAuthority(request, "CA");
      if (path === visitSearchPath) return visitSearchReply(request, "CA");
      if (path === customerHistoryPath) return historyReply(request, "CA");
      if (path === vehicleHistoryPath) return historyReply(request, "CA", true);
      return undefined;
    },
  });
  await fixture.install(page);
  await page.goto("/customers");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(
    page.getByRole("heading", { name: "Visit Contacts", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Alex");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Alex One", { exact: true })).toBeVisible();
  return fixture;
}
