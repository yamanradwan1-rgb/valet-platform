import { expect, test, type Page } from "@playwright/test";

import {
  DashboardApiFixture,
  employeeContext,
  LOCATION_A,
  ORG_A,
  supervisorContext,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { staleInactiveExactLocationContext } from "./support/md05-intelligence-fixtures";
import {
  companyLocationReportsFixture,
  companyReportsFixture,
  enterCompanyLocationReports,
  enterCompanyReports,
  enterManagerReports,
  managerReportsFixture,
} from "./support/md05-reports-e2e-helpers";

const md05 = [
  ["Overview", "/overview"],
  ["Payments", "/payments"],
  ["Analytics", "/analytics"],
  ["Reports", "/reports"],
] as const;

async function expectMd05Navigation(page: Page, labels = md05.map(([label]) => label)) {
  const nav = page.locator(".sidebar-navigation");
  for (const label of labels) await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Validations|التحققات/u })).toHaveCount(0);
}

test("CA All Locations sees exactly the four retained MD-05 destinations", async ({ page }) => {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  await enterCompanyReports(page);
  await expectMd05Navigation(page);
});

test("CA active exact Location sees the same four retained destinations", async ({ page }) => {
  const fixture = companyLocationReportsFixture();
  await fixture.install(page);
  await enterCompanyLocationReports(page);
  await expectMd05Navigation(page);
});

test("LM active exact granted Location sees the same four retained destinations", async ({ page }) => {
  const fixture = managerReportsFixture();
  await fixture.install(page);
  await enterManagerReports(page);
  await expectMd05Navigation(page);
});

test("Supervisor has no MD-05 navigation or Reports business content", async ({ page }) => {
  const fixture = new DashboardApiFixture({ operationalContexts: [supervisorContext()] });
  await fixture.install(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page, "supervisor@example.com");
  const nav = page.locator(".sidebar-navigation");
  for (const [label] of md05) await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);
});

test("Employee direct Reports route exposes no MD-05 business content", async ({ page }) => {
  const fixture = new DashboardApiFixture({ operationalContexts: [employeeContext()] });
  await fixture.install(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page, "employee@example.com");
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);
  for (const [label] of md05) await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
});

test("Guest/unauthenticated direct MD-05 routes expose no business content", async ({ page }) => {
  const fixture = new DashboardApiFixture();
  await fixture.install(page);
  for (const [label, path] of md05) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: label, exact: true })).toHaveCount(0);
  }
});

test("stale exact Location revalidating INACTIVE omits MD-05 navigation and content", async ({ page }) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: staleInactiveExactLocationContext(),
  });
  await fixture.install(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);
  for (const [label] of md05) await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
});

test("historical INACTIVE Location is disabled before MD-05 navigation can attach", async ({ page }) => {
  const historical = { ...LOCATION_A, status: "INACTIVE" as const };
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [historical] },
  });
  await fixture.install(page);
  await page.goto("/reports");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(page.getByRole("button", { name: /Main Garage/u })).toBeDisabled();
  await expect(page.getByTestId("md05-reports-page")).toHaveCount(0);
  for (const [label] of md05) await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
});

test("Arabic RTL navigation exposes the four localized labels and no Validations", async ({ page }) => {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  await enterCompanyReports(page);
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectMd05Navigation(page, ["نظرة عامة", "المدفوعات", "التحليلات", "التقارير"]);
});

test("keyboard activates all four MD-05 navigation destinations", async ({ page }) => {
  const fixture = companyReportsFixture();
  await fixture.install(page);
  await enterCompanyReports(page);
  for (const [label, path] of md05) {
    const link = page.getByRole("navigation", { name: "Management navigation" })
      .getByRole("link", { name: label, exact: true });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}$`, "u"));
  }
});
