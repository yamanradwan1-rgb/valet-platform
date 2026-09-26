import { expect, test } from "@playwright/test";

import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import {
  enterLocations,
  fillCreate,
  locationsPath,
} from "./support/r06-locations";

test("nested create MFA traps focus, Escape closes only challenge and restores focus", async ({
  page,
}) => {
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [] },
    mfaState: "STEP_UP_REQUIRED",
    override: (path, request) =>
      path === locationsPath && request.method() === "POST"
        ? {
            status: 403,
            body: {
              code: "MFA_STEP_UP_REQUIRED",
              message: "Verification required",
              requestId: "r06-focus",
            },
          }
        : undefined,
  });
  await fixture.install(page);
  await enterLocations(page);
  const dialog = await fillCreate(page);
  const submit = dialog.getByRole("button", {
    name: "Create Location",
    exact: true,
  });
  await dialog.getByLabel("Name", { exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("Name", { exact: true })).toBeFocused();
  await submit.click();
  const challenge = page.getByRole("dialog", { name: "Verification required" });
  const code = challenge.getByLabel(/authenticator code/);
  await expect(code).toBeFocused();
  await code.fill("123456");
  await code.press("Shift+Tab");
  await expect(
    challenge.getByRole("button", { name: "Verify", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(code).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(challenge).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(submit).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add Location", exact: true }),
  ).toBeFocused();
});
