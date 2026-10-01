import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  enterPhysicalResources,
  openPhysicalResources,
} from "./support/keys-spots";
import {
  Issue236ZoneState,
  openSpot,
  zonePath,
  enterZoneFlow,
} from "./support/issue236-parking-zones";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function switchDuringDialog(page: Page, name: string) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Change scope", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page
    .getByRole("option", { name, exact: true })
    .evaluate((option: HTMLElement) => option.click());
  await expect(page.locator(".topbar .location-context")).toContainText(name);
  await openPhysicalResources(page);
}
async function fillZone(page: Page, code: string) {
  const spot = await openSpot(page);
  await spot.getByRole("button", { name: "Add Parking Zone" }).click();
  const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
  await zone.getByLabel("Code").fill(code);
  await zone.getByLabel("Label").fill(code);
  return zone;
}

for (const outcome of ["success", "failure", "mfa"] as const) {
  test(`A→B→A fences first-A zone ${outcome}, reconciliation, busy and MFA callbacks`, async ({
    page,
  }) => {
    const state = new Issue236ZoneState();
    const started = deferred();
    const release = deferred();
    const api = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path, request) => {
        if (path === zonePath && request.method() === "POST") {
          started.resolve();
          await release.promise;
          return outcome === "success"
            ? {
                status: 201,
                body: {
                  parkingZoneId: "99999999-9999-4999-8999-999999999999",
                  code: "OLD-A",
                  label: "Old A",
                  status: "ACTIVE",
                },
              }
            : {
                status: outcome === "mfa" ? 403 : 409,
                body: {
                  code:
                    outcome === "mfa"
                      ? "MFA_STEP_UP_REQUIRED"
                      : "RESOURCE_CODE_CONFLICT",
                  message: "OLD-FAILURE",
                  requestId: "old-zone",
                },
              };
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
    const old = await fillZone(page, "OLD-A");
    await old.getByRole("button", { name: "Create", exact: true }).click();
    await started.promise;
    await switchDuringDialog(page, LOCATION_B.name);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("OLD-A", { exact: true })).toHaveCount(0);
    await switchDuringDialog(page, LOCATION_A.name);
    const current = await fillZone(page, "CURRENT-A");
    const reads = state.reads.length;
    release.resolve();
    await page.waitForTimeout(100);
    await expect(current.getByLabel("Code")).toHaveValue("CURRENT-A");
    await expect(
      current.getByRole("button", { name: "Create", exact: true }),
    ).toBeEnabled();
    await expect(page.getByText("OLD-FAILURE", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    expect(state.reads).toHaveLength(reads);
  });
}

for (const replacement of [false, true]) {
  test(`logout${replacement ? " and identity replacement" : ""} fences delayed zone mutation`, async ({
    page,
  }) => {
    const state = new Issue236ZoneState();
    const started = deferred();
    const release = deferred();
    const api = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: async (path, request) => {
        if (path === zonePath && request.method() === "POST") {
          started.resolve();
          await release.promise;
          return {
            status: 409,
            body: {
              code: "RESOURCE_CODE_CONFLICT",
              message: "OLD-IDENTITY",
              requestId: "old",
            },
          };
        }
        return state.reply(path, request);
      },
    });
    await api.install(page);
    await enterPhysicalResources(page);
    const old = await fillZone(page, "OLD");
    await old.getByRole("button", { name: "Create", exact: true }).click();
    await started.promise;
    await page
      .getByRole("button", { name: "Sign out" })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    if (replacement) {
      await signInOnCurrentPage(page, "replacement@example.com");
      await page.getByRole("button", { name: ORG_A.name }).click();
      await page
        .getByRole("button", { name: LOCATION_A.name, exact: true })
        .click();
      await openPhysicalResources(page);
      await fillZone(page, "NEW-IDENTITY");
    }
    const reads = state.reads.length;
    release.resolve();
    await page.waitForTimeout(100);
    await expect(page.getByText("OLD-IDENTITY", { exact: true })).toHaveCount(
      0,
    );
    expect(state.reads).toHaveLength(reads);
    if (replacement)
      await expect(
        page
          .getByRole("dialog", { name: "Add Parking Zone" })
          .getByLabel("Code"),
      ).toHaveValue("NEW-IDENTITY");
  });
}

test("MFA verification suspends the zone trap, retains the draft and requires explicit same-operation retry", async ({
  page,
}) => {
  const state = new Issue236ZoneState();
  state.nextError = "MFA_STEP_UP_REQUIRED";
  const { spot, api } = await enterZoneFlow(page, state);
  await spot.getByRole("button", { name: "Add Parking Zone" }).click();
  const zone = page.getByRole("dialog", { name: "Add Parking Zone" });
  await zone.getByLabel("Code").fill("MFA");
  await zone.getByLabel("Label").fill("MFA Zone");
  await zone.getByRole("button", { name: "Create", exact: true }).click();
  const mfa = page.getByRole("dialog", { name: "Verification required" });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await mfa.getByLabel("6-digit authenticator code").fill("123456");
  await mfa.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(zone.getByRole("alert")).toContainText("submit again");
  expect(state.posts).toHaveLength(1);
  expect(api.count("/v1/staff/auth/mfa/step-up")).toBe(1);
  await expect(zone.getByLabel("Code")).toHaveValue("MFA");
  await zone.getByRole("button", { name: "Create", exact: true }).click();
  await expect(spot).toBeVisible();
  expect(state.posts).toHaveLength(2);
  expect(state.posts[0]!.operationId).toBe(state.posts[1]!.operationId);
});
