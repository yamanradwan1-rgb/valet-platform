import { expect, test, type Page, type Request } from "@playwright/test";
import { contextHelpRegistry, type ContextHelpKey } from "../src/features/help/context-help-registry";
import { DashboardApiFixture, LOCATION_A, ORG_A } from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { md04AuditReply } from "./support/md04-audit-fixtures";
import {
  md04FeatureAuthority, visitSearchPath, visitSearchReply,
  customerHistoryPath, vehicleHistoryPath, historyReply,
} from "./support/md04-fixtures";

const help = (page: Page, key: ContextHelpKey) =>
  page.getByRole("button", { name: "Help: " + contextHelpRegistry[key].en.title, exact: true });

async function openHelp(page: Page, key: ContextHelpKey) {
  const trigger = help(page, key);
  await expect(trigger).toHaveAttribute("type", "button");
  await trigger.click();
  const modal = page.getByRole("dialog", { name: contextHelpRegistry[key].en.title, exact: true });
  await expect(modal).toContainText(contextHelpRegistry[key].en.body);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function signInCompany(page: Page, route: string, fixture: DashboardApiFixture) {
  await fixture.install(page);
  await page.goto(route);
  await signInOnCurrentPage(page, "admin@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  if (route === "/audit-log") {
    await page.getByRole("button", { name: "All Locations" }).click();
  }
}

test("Audit four real mounts preserve filter, event drawer, Escape, focus and read budgets", async ({ page }) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) writes.push(path);
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      return md04AuditReply(path, request, "CA");
    },
  });
  await signInCompany(page, "/audit-log", fixture);
  await expect(page.getByText("Loaded 4 events", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const before = [...fixture.counts.entries()].sort();
  for (const key of ["audit.page", "audit.filters", "audit.table"] as const) await openHelp(page, key);
  await page.getByRole("cell", { name: "Location configuration override set" }).first()
    .locator("xpath=..")
    .getByRole("button", { name: /Inspect/u }).click();
  const parent = page.getByRole("dialog", { name: "Audit Event Details" });
  await expect(parent).toBeVisible();
  await expect(parent.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await openHelp(page, "audit.detail");
  await expect(parent).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(parent).toHaveCount(0);
  expect([...fixture.counts.entries()].sort()).toEqual(before);
  expect(writes).toEqual([]);
});

test("Customers Help preserves search draft and nested correction without mutation", async ({ page }) => {
  const writes: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (path, request: Request) => {
      if (request.method() !== "GET" && !path.startsWith("/v1/staff/auth/")) writes.push(path);
      if (path === "/v1/staff/dashboard/feature-authority") return md04FeatureAuthority(request, "CA");
      if (path === visitSearchPath) return visitSearchReply(request, "CA");
      if (path === customerHistoryPath) return historyReply(request, "CA");
      if (path === vehicleHistoryPath) return historyReply(request, "CA", true);
      return undefined;
    },
  });
  await signInCompany(page, "/customers", fixture);
  const search = page.getByLabel("Name", { exact: true });
  await search.fill("Correction");
  await openHelp(page, "contacts.page");
  await openHelp(page, "contacts.search");
  await expect(search).toHaveValue("Correction");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Correction Contact", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await openHelp(page, "contacts.results");
  await page.locator("tbody tr").filter({ hasText: "Correction Contact" })
    .getByRole("button", { name: /Details/u }).click();
  const detail = page.getByRole("dialog", { name: "Correction Contact" });
  await expect(detail.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.waitForLoadState("networkidle");
  const before = [...fixture.counts.entries()].sort();
  await openHelp(page, "contacts.detail");
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "Correct name" }).click();
  const correction = page.getByRole("dialog", { name: "Correct Visit Contact" });
  const draft = correction.getByRole("textbox");
  await draft.fill("Unsaved synthetic name");
  await openHelp(page, "contacts.correction");
  await expect(correction).toBeVisible();
  await expect(draft).toHaveValue("Unsaved synthetic name");
  expect([...fixture.counts.entries()].sort()).toEqual(before);
  expect(writes).toEqual([]);
});
