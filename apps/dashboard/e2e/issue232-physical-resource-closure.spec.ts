import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { Issue232PhysicalState } from "./support/issue232-physical-resources";
import {
  enterLocations,
  lifecyclePath,
  selectLocation,
} from "./support/r06-locations";

const keyPath = `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/physical-resources/key-slots`;

function physicalFixture(state: Issue232PhysicalState, lifecycleRequiresMfa = false) {
  return new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    mfaState: lifecycleRequiresMfa ? "STEP_UP_REQUIRED" : "ASSURED",
    override: (path, request, api) => {
      if (path === lifecyclePath && lifecycleRequiresMfa && !api.mfaAssured) {
        return {
          status: 403,
          body: {
            code: "MFA_STEP_UP_REQUIRED",
            message: "Verification required",
            requestId: "issue232-lifecycle-mfa",
          },
        };
      }
      return state.reply(path, request);
    },
  });
}

test("Company Admin physical-resource read remains Standard when lifecycle needs Sensitive MFA", async ({ page }) => {
  const state = new Issue232PhysicalState(true);
  const fixture = physicalFixture(state, true);
  await fixture.install(page);
  await enterLocations(page);
  await selectLocation(page);

  const challenge = page.getByRole("dialog", { name: "Verification required" });
  await expect(challenge).toBeVisible();
  expect(fixture.count(keyPath)).toBeGreaterThan(0);
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(0);
  await challenge.press("Escape");
  await expect(page.getByText("K-01", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View label" }).first()).toBeEnabled();
  expect(fixture.count("/v1/staff/auth/mfa/step-up")).toBe(0);
});

test("lost create response rereads authority and explicit retry recovers the same operation", async ({ page }) => {
  const state = new Issue232PhysicalState(false);
  const fixture = physicalFixture(state);
  await fixture.install(page);
  let loseFirstPost = true;
  await page.route(`**${keyPath}`, async (route) => {
    if (loseFirstPost && route.request().method() === "POST") {
      loseFirstPost = false;
      state.reply(keyPath, route.request());
      await route.abort("connectionreset");
      return;
    }
    await route.fallback();
  });
  await enterLocations(page);
  await selectLocation(page);
  const readsBefore = fixture.count(keyPath);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Code").fill("K-77");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect.poll(() => fixture.count(keyPath)).toBeGreaterThan(readsBefore);
  expect(state.keySlots).toHaveLength(1);
  expect(state.keyPostBodies).toHaveLength(1);

  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Physical resource label" }).getByText("K-77", { exact: true })).toBeVisible();
  expect(state.keySlots).toHaveLength(1);
  expect(state.keyPostBodies).toHaveLength(2);
  expect((state.keyPostBodies[0] as { operationId: string }).operationId).toBe(
    (state.keyPostBodies[1] as { operationId: string }).operationId,
  );
});

test("identity replacement cannot reuse a pending create operation id", async ({ page }) => {
  const state = new Issue232PhysicalState(false);
  state.failNextKeyPost401 = true;
  const fixture = physicalFixture(state);
  await fixture.install(page);
  await enterLocations(page);
  await selectLocation(page);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  let dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Code").fill("K-88");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.keyPostBodies).toHaveLength(1);
  const oldOperationId = (state.keyPostBodies[0] as { operationId: string }).operationId;

  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "replacement@example.com");
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
  await selectLocation(page);
  await page.getByRole("button", { name: "Add Key Slot" }).click();
  dialog = page.getByRole("dialog", { name: "Add Key Slot" });
  await dialog.getByLabel("Code").fill("K-88");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Physical resource label" }).getByText("K-88", { exact: true })).toBeVisible();
  expect(state.keyPostBodies).toHaveLength(2);
  expect((state.keyPostBodies[1] as { operationId: string }).operationId).not.toBe(oldOperationId);
});
