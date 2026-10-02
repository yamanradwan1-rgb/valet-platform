import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  fillCreate,
  openEmployees,
  STAFF_BASE,
} from "./support/issue240d-onboarding";

for (const mode of [
  { locale: "en", dark: false, width: 1440 },
  { locale: "ar", dark: true, width: 1440 },
  { locale: "en", dark: true, width: 480 },
  { locale: "ar", dark: false, width: 480 },
] as const) {
  test(`existing MFA ${mode.locale} ${mode.dark} ${mode.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: mode.width, height: 900 });
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path, request) =>
        path === STAFF_BASE && request.method() === "POST"
          ? {
              status: 403,
              body: {
                code: "MFA_STEP_UP_REQUIRED",
                message: "Required",
                requestId: "baseline",
              },
            }
          : path === STAFF_BASE
            ? { body: { items: [], nextCursor: null } }
            : undefined,
    });
    await openEmployees(page, fixture);
    if (mode.dark)
      await page
        .getByRole("group", { name: "Theme" })
        .getByRole("button")
        .nth(1)
        .click();
    await page
      .getByRole("button", { name: "Create Employee", exact: true })
      .click();
    const create = await fillCreate(page);
    await create
      .getByRole("button", { name: "Create Employee", exact: true })
      .click();
    await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
    if (mode.locale === "ar")
      await page
        .getByRole("button", { name: "Language", exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath("mfa.png"),
      animations: "disabled",
    });
  });
}
