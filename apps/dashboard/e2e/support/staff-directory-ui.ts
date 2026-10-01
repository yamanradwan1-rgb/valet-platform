import { expect, type Page } from "@playwright/test";
import { ORG_A } from "./dashboard-api-fixture";
import { signInOnCurrentPage } from "./foundation-ui";
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function signInCompany(page: Page) {
  await page.goto("/employees");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await expect(
    page.getByRole("heading", { name: "Employees & Shifts" }),
  ).toBeVisible();
}
export async function changeOrganization(page: Page, organizationName: string) {
  await page.locator(".sidebar-scope").click();
  await page.getByRole("button", { name: organizationName }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}
