import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterPhysicalResources,
  openPhysicalResources,
} from "./support/keys-spots";
import {
  Issue236ZoneState,
  openSpot,
  zonePath,
} from "./support/issue236-parking-zones";

test("dispatched zone 401 reconciles auth without replay and explicit retry retains the operation", async ({
  page,
}) => {
  const state = new Issue236ZoneState();
  let rejectedBody: unknown;
  const api = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (
        path === zonePath &&
        request.method() === "POST" &&
        rejectedBody === undefined
      ) {
        rejectedBody = request.postDataJSON();
        return {
          status: 401,
          body: {
            code: "STAFF_AUTHENTICATION_REQUIRED",
            message: "Expired",
            requestId: "zone-401",
          },
        };
      }
      return state.reply(path, request);
    },
  });
  await api.install(page);
  await enterPhysicalResources(page);
  async function fill() {
    const spot = await openSpot(page);
    await spot.getByRole("button", { name: "Add Parking Zone" }).click();
    const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
    await zone.getByLabel("Code").fill("AUTH-RETRY");
    await zone.getByLabel("Label").fill("Auth Retry");
    return { spot, zone };
  }
  const first = await fill();
  const refreshBefore = api.count("/v1/staff/auth/refresh");
  await first.zone.getByRole("button", { name: "Create", exact: true }).click();
  await expect(first.zone).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
  expect(api.count("/v1/staff/auth/refresh")).toBe(refreshBefore + 1);
  await openPhysicalResources(page);
  const retry = await fill();
  await retry.zone.getByRole("button", { name: "Create", exact: true }).click();
  await expect(retry.spot).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]!.operationId).toBe(
    (rejectedBody as { operationId: string }).operationId,
  );
});
