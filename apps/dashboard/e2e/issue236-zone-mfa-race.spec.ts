import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterPhysicalResources,
  openPhysicalResources,
} from "./support/keys-spots";
import { Issue236ZoneState, openSpot } from "./support/issue236-parking-zones";

for (const failure of [false, true]) {
  test(`delayed zone MFA ${failure ? "failure" : "success"} cannot restore a first-A draft`, async ({
    page,
  }) => {
    const state = new Issue236ZoneState();
    state.nextError = "MFA_STEP_UP_REQUIRED";
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((done) => {
      release = done;
    });
    const dispatched = new Promise<void>((done) => {
      started = done;
    });
    const api = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path, request) => {
        if (path === "/v1/staff/auth/mfa/step-up") {
          started();
          await blocked;
          return failure
            ? {
                status: 403,
                body: {
                  code: "MFA_CODE_INVALID",
                  message: "OLD-MFA-ERROR",
                  requestId: "old-mfa",
                },
              }
            : { body: { state: "ASSURED" } };
        }
        if (
          path.includes(LOCATION_B.locationId) &&
          path.includes("physical-resources")
        )
          return { body: { items: [], nextCursor: null } };
        return state.reply(path, request);
      },
    });
    await api.install(page);
    await enterPhysicalResources(page);
    const spot = await openSpot(page);
    await spot.getByRole("button", { name: "Add Parking Zone" }).click();
    const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
    await zone.getByLabel("Code").fill("OLD-A");
    await zone.getByLabel("Label").fill("OLD-A");
    await zone.getByRole("button", { name: "Create", exact: true }).click();
    const mfa = page.getByRole("dialog", { name: "Verification required" });
    await mfa.getByLabel("6-digit authenticator code").fill("123456");
    await mfa.getByRole("button", { name: "Verify", exact: true }).click();
    await dispatched;
    for (const location of [LOCATION_B, LOCATION_A]) {
      await page
        .locator(".topbar")
        .getByRole("button", { name: "Change scope", exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());
      await page
        .getByRole("option", { name: location.name, exact: true })
        .evaluate((option: HTMLElement) => option.click());
      await expect(page.locator(".topbar .location-context")).toContainText(
        location.name,
      );
      await openPhysicalResources(page);
    }
    const currentSpot = await openSpot(page);
    await currentSpot.getByRole("button", { name: "Add Parking Zone" }).click();
    await zone.getByLabel("Code").fill("CURRENT-A");
    await zone.getByLabel("Label").fill("CURRENT-A");
    release();
    await page.waitForTimeout(200);
    await expect(zone.getByLabel("Code")).toHaveValue("CURRENT-A");
    await expect(zone.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    expect(state.posts).toHaveLength(1);
  });
}
