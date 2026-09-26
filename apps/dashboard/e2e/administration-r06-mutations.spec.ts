import { expect, test } from "@playwright/test";
import { persistentMatches } from "./support/persistent-storage";

import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import {
  enterLocations,
  fillCreate,
  lifecyclePath,
  locationLifecycle,
  locationsPath,
  selectLocation,
} from "./support/r06-locations";

for (const outcome of [
  "UNKNOWN_OUTCOME",
  "MFA_STEP_UP_REQUIRED",
  "AUTHORIZATION_DENIED",
]) {
  test(`create preserves explicit intent after ${outcome}`, async ({
    page,
  }) => {
    const bodies: Record<string, unknown>[] = [];
    let dashboardAccess = true;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [] },
      mfaState: "STEP_UP_REQUIRED",
      override: (path, request) => {
        if (path === lifecyclePath) return { body: locationLifecycle() };
        if (path !== locationsPath || request.method() !== "POST")
          return undefined;
        bodies.push(request.postDataJSON());
        return bodies.length === 1
          ? {
              status: !dashboardAccess
                ? 404
                : outcome === "UNKNOWN_OUTCOME"
                  ? 503
                  : 403,
              body: {
                code: outcome,
                message: outcome,
                requestId: "r06-create",
              },
            }
          : { body: locationLifecycle() };
      },
    });
    await fixture.install(page);
    await enterLocations(page);
    const dialog = await fillCreate(page);
    if (outcome === "AUTHORIZATION_DENIED") dashboardAccess = false;
    await dialog
      .getByRole("button", { name: "Create Location", exact: true })
      .click();
    if (outcome === "MFA_STEP_UP_REQUIRED") {
      const challenge = page.getByRole("dialog", {
        name: "Verification required",
      });
      await challenge.getByLabel(/authenticator code/).fill("123456");
      await challenge
        .getByRole("button", { name: "Verify", exact: true })
        .click();
      await expect(challenge).toHaveCount(0);
      await expect(dialog.getByRole("alert")).toContainText(
        "Verification succeeded",
      );
    } else await expect(dialog.getByRole("alert")).toContainText(outcome);
    expect(bodies).toHaveLength(1);
    await expect(
      page.getByTestId("location-master").getByText("New R06 Location"),
    ).toHaveCount(0);
    expect(
      await persistentMatches(page, String(bodies[0]?.operationId)),
    ).toEqual({ local: [], session: [], indexed: [], cache: [] });
    expect(await persistentMatches(page, "R06 create sentinel")).toEqual({
      local: [],
      session: [],
      indexed: [],
      cache: [],
    });
    dashboardAccess = true;
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Create Location", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[0]).toEqual({
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "New R06 Location",
      code: "R06",
      addressText: "R06 create sentinel",
      timezone: "Asia/Amman",
      currency: "JOD",
    });
    const next = await fillCreate(page);
    await next
      .getByRole("button", { name: "Create Location", exact: true })
      .click();
    await expect(next).toHaveCount(0);
    expect(bodies[2]?.operationId).not.toBe(bodies[0]?.operationId);
  });
}

test("one in-flight create rejects double submit", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [] },
    override: async (path, request) => {
      if (path === lifecyclePath) return { body: locationLifecycle() };
      if (path !== locationsPath || request.method() !== "POST")
        return undefined;
      posts++;
      await pending;
      return { body: locationLifecycle() };
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  const dialog = await fillCreate(page);
  const submit = dialog.getByRole("button", {
    name: "Create Location",
    exact: true,
  });
  await submit.click();
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Code", { exact: true }).press("Enter");
  expect(posts).toBe(1);
  release();
  await expect(dialog).toHaveCount(0);
  expect(posts).toBe(1);
});

test("activation, intake stop and drained deactivation use exact server concurrency tokens", async ({
  page,
}) => {
  let current = locationLifecycle();
  const calls: string[] = [];
  const tokens: string[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === lifecyclePath) return { body: current };
      if (!path.startsWith(locationsPath) || request.method() !== "POST")
        return undefined;
      tokens.push(request.postDataJSON().expectedUpdatedAt);
      const action = path.split("/").at(-1)!;
      calls.push(action);
      current = locationLifecycle({
        status: action === "deactivate" ? "INACTIVE" : "ACTIVE",
        acceptingIntake: action === "activate",
        updatedAt: `2026-09-26T09:0${calls.length}:00.000Z`,
      });
      return { body: current };
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  await selectLocation(page);
  for (const label of ["Activate", "Stop intake", "Deactivate"]) {
    const action = page.getByRole("button", { name: label, exact: true });
    await expect(action).toBeEnabled();
    await action.click();
  }
  await expect(
    page.getByRole("button", { name: "Activate", exact: true }),
  ).toBeEnabled();
  expect(calls).toEqual(["activate", "stop-intake", "deactivate"]);
  expect(tokens).toEqual([
    "2026-09-26T09:00:00.000Z",
    "2026-09-26T09:01:00.000Z",
    "2026-09-26T09:02:00.000Z",
  ]);
});

test("timezone correction preserves truthful impact through authoritative reload", async ({
  page,
}) => {
  let current = locationLifecycle();
  let body: unknown;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path, request) => {
      if (path === lifecyclePath) return { body: current };
      if (!path.endsWith("/timezone-correction")) return undefined;
      body = request.postDataJSON();
      current = locationLifecycle({
        timezone: "Asia/Dubai",
        updatedAt: "2026-09-26T09:01:00.000Z",
      });
      return {
        body: {
          location: current,
          impact: {
            previousTimezone: "Asia/Amman",
            newTimezone: "Asia/Dubai",
            historicalTimestampsRewritten: false,
            historicalReportFactsRewritten: false,
          },
        },
      };
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  await selectLocation(page);
  await page.getByLabel("Correct timezone", { exact: true }).fill("Asia/Dubai");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Correct configured timezone");
  await page
    .getByLabel("Correct timezone", { exact: true })
    .locator("..")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    page.getByText(
      "Historical timestamps and report facts were not rewritten.",
    ),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("location-detail")
      .getByText("Asia/Dubai", { exact: true }),
  ).toBeVisible();
  expect(body).toEqual({
    expectedUpdatedAt: "2026-09-26T09:00:00.000Z",
    newTimezone: "Asia/Dubai",
    reason: "Correct configured timezone",
  });
});
