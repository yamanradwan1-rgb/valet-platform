import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture, LOCATION_A, ORG_A, supervisorContext,
} from "../e2e/support/dashboard-api-fixture";
import { signInOnCurrentPage } from "../e2e/support/foundation-ui";
import { enterInspector, inspector, selectLocation } from "./issue304-contract";
import { issue304Fixture } from "./issue304-fixture";

for (const role of ["CA", "LM"] as const) {
  test(`Issue304 ${role} can inspect only explicitly granted exact Locations`, async ({ page }) => {
    const fixture = issue304Fixture({ role });
    await fixture.install(page);
    await enterInspector(page, role);
    await expect(inspector(page)).toBeVisible();
    await selectLocation(page, "B");
    await expect(inspector(page)).toBeVisible();
    await page.locator(".topbar").getByRole("button", { name: "Change scope" }).click();
    await expect(page.getByRole("option", { name: "All Locations" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
}

test("Issue304 supervisor cannot enter Company/Location Manager resource inspector", async ({ page }) => {
  // Explicit supervisor context is the operational role, no Management grant.
  const own = new DashboardApiFixture({
    operationalContexts: [supervisorContext()],
  });
  await own.install(page);
  await page.goto("/keys");
  await signInOnCurrentPage(page, "supervisor@example.com");
  await page.getByRole("button", { name: `${ORG_A.name} · ${LOCATION_A.name}` }).click();
  await expect(inspector(page)).toHaveCount(0);
  const resourcePaths = [...own.counts.keys()].filter((path) =>
    /\/physical-resources\/|\/overview\/keys$/u.test(path));
  expect(resourcePaths).toEqual([]);
});

test("Issue304 API denial clears vehicle/plate and does not expose stale privileged detail", async ({ page }) => {
  let denied = false;
  const fixture = issue304Fixture({ onRequest: (path) => denied &&
    /\/physical-resources\/parking-spots$/u.test(path)
    ? { status: 403, body: { code: "AUTHORIZATION_DENIED", message: "Denied", requestId: "issue304" } }
    : undefined });
  await fixture.install(page);
  await enterInspector(page);
  await inspector(page).getByRole("button", { name: /Parking Spots|مواقف السيارات/u }).first().click();
  await expect(inspector(page).getByText("DEMO 4821").first()).toBeVisible();
  denied = true;
  await selectLocation(page, "B");
  await selectLocation(page, "A");
  await expect(inspector(page).getByText("DEMO 4821", { exact: true })).toHaveCount(0);
  await expect(inspector(page).getByRole("alert")).toBeVisible();
});
