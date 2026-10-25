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
  selectLocation,
} from "./support/r06-locations";

const labels = {
  activeShiftPresent: "Active shift",
  nonCompletedValetSessionPresent: "Non-completed session",
  nonTerminalTaskPresent: "Non-terminal task",
} as const;
for (const blocker of Object.keys(labels) as (keyof typeof labels)[]) {
  test(`#340 truthful ${blocker} drain explanation`, async ({ page }, info) => {
    const current = locationLifecycle({
      status: "ACTIVE",
      drain: {
        blocked: true,
        activeShiftPresent: false,
        nonCompletedValetSessionPresent: false,
        nonTerminalTaskPresent: false,
        [blocker]: true,
      },
    });
    await new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (path) =>
        path === lifecyclePath ? { body: current } : undefined,
    }).install(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterLocations(page);
    await selectLocation(page);
    await page.screenshot({
      path: info.outputPath(`drain-${blocker}.png`),
      fullPage: true,
    });
    const drain = page
      .getByRole("heading", { name: "Drain status", exact: true })
      .locator("..");
    for (const [key, label] of Object.entries(labels)) {
      await expect(drain).toContainText(
        `${label}: ${key === blocker ? "Present" : "None"}`,
      );
    }
    await expect(
      page.getByRole("button", { name: "Deactivate", exact: true }),
    ).toBeDisabled();
  });
}
