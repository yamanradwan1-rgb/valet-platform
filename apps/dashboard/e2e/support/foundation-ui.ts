import { expect, type Page } from "@playwright/test";

import { LOCATION_A, ORG_A } from "./dashboard-api-fixture";

export async function signIn(
  page: Page,
  email = "admin@example.com",
): Promise<void> {
  await page.goto("/");
  await signInOnCurrentPage(page, email);
}

export async function signInOnCurrentPage(
  page: Page,
  email = "admin@example.com",
): Promise<void> {
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your authorized workspace" }),
  ).toBeVisible();
}

export async function openLocationManagerWorkspace(page: Page): Promise<void> {
  await signIn(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: LOCATION_A.name }).click();
  await expect(page).toHaveURL(/\/overview$/u);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

export async function expectSupervisorNarrowNavigation(page: Page): Promise<void> {
  const navigation = page
    .getByRole("navigation", { name: "Management navigation" });
  await expect(navigation.getByRole("link")).toHaveText([
    "Maps & Zones",
    "Security",
    "Help",
  ]);
  for (const forbidden of ["Administration", "Analytics", "Reports"]) {
    await expect(page.getByRole("link", { name: forbidden })).toHaveCount(0);
  }
}
