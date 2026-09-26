import { expect, test } from "@playwright/test";

import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
  locationsPath,
  selectLocation,
} from "./support/r06-locations";

for (const failure of [false, true]) {
  test(`A to B to A fences delayed first-A ${failure ? "failure" : "success"}`, async ({
    page,
  }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    let returned = false;
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: async (path) => {
        if (path === `${locationsPath}/${LOCATION_B.locationId}/lifecycle`)
          return { body: locationLifecycle(LOCATION_B) };
        if (path !== lifecyclePath) return undefined;
        reads++;
        if (reads === 1) {
          await pending;
          returned = true;
          return failure
            ? {
                status: 403,
                body: {
                  code: "MFA_STEP_UP_REQUIRED",
                  message: "stale A error",
                  requestId: "old-a",
                },
              }
            : { body: locationLifecycle({ addressText: "stale A address" }) };
        }
        return { body: locationLifecycle({ addressText: "fresh A address" }) };
      },
    });
    await fixture.install(page);
    await enterLocations(page);
    await page
      .getByTestId("location-master")
      .getByRole("button", { name: /Main Garage/ })
      .click();
    await expect.poll(() => reads).toBe(1);
    await selectLocation(page, LOCATION_B.name);
    await selectLocation(page);
    await expect(page.getByText("fresh A address")).toBeVisible();
    release();
    await expect.poll(() => returned).toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByText("stale A address")).toHaveCount(0);
    await expect(page.getByText("stale A error")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(reads).toBe(2);
  });
}

test("opaque next/previous cursor resets across Organization and selection", async ({
  page,
}) => {
  const orgBPath = locationsPath.replace(
    ORG_A.organizationId,
    ORG_B.organizationId,
  );
  const cursors: Array<string | null> = [];
  let entered = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A, ORG_B],
    companyLocations: {
      [ORG_A.organizationId]: [LOCATION_A],
      [ORG_B.organizationId]: [LOCATION_B],
    },
    override: (path, request) => {
      if (path === lifecyclePath) return { body: locationLifecycle() };
      if (!entered) return undefined;
      const cursor = new URL(request.url()).searchParams.get("cursor");
      if (path === locationsPath)
        return {
          body: {
            items: [cursor ? LOCATION_B : LOCATION_A],
            nextCursor: cursor ? null : "opaque_A_cursor-123456",
          },
        };
      if (path === orgBPath) {
        cursors.push(cursor);
        return { body: { items: [LOCATION_B], nextCursor: null } };
      }
      return undefined;
    },
  });
  await fixture.install(page);
  // Enumeration is also used by the scope picker; retain its authorized projection.
  await page.goto("/locations");
  const { signInOnCurrentPage } = await import("./support/foundation-ui");
  await signInOnCurrentPage(page);
  await page.getByRole("button", { name: ORG_A.name }).click();
  await expect(
    page.getByRole("button", { name: "All Locations", exact: true }),
  ).toBeVisible();
  entered = true;
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  await selectLocation(page);
  const master = page.getByTestId("location-master");
  await master.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    master.getByRole("button", { name: /North Garage/ }),
  ).toBeVisible();
  await expect(
    master.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await master.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    master.getByRole("button", { name: /Main Garage/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change scope", exact: true }).click();
  await page.getByRole("button", { name: ORG_B.name }).click();
  await page
    .getByRole("button", { name: "All Locations", exact: true })
    .click();
  await expect(
    master.getByRole("button", { name: /North Garage/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Select a Location to view this information."),
  ).toBeVisible();
  expect(cursors.length).toBeGreaterThan(0);
  expect(cursors.every((cursor) => cursor === null)).toBe(true);
  await expect(
    master.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
});

test("pending lifecycle response cannot repaint after logout", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path) => {
      if (path !== lifecyclePath) return undefined;
      await pending;
      return { body: locationLifecycle() };
    },
  });
  await fixture.install(page);
  await enterLocations(page);
  await page
    .getByTestId("location-master")
    .getByRole("button", { name: /Main Garage/ })
    .click();
  await expect.poll(() => fixture.count(lifecyclePath)).toBe(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  release();
  await expect(page.getByTestId("location-detail")).toHaveCount(0);
  await expect(page.getByText("R06 protected address sentinel")).toHaveCount(0);
});
