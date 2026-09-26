import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
  locationsPath,
} from "./support/r06-locations";

for (const pendingKind of ["list", "detail"] as const) {
  for (const replacement of ["organization", "session"] as const) {
    test(`delayed ${pendingKind} cannot repaint after ${replacement} replacement`, async ({
      page,
    }) => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      let held = false;
      let returned = false;
      const orgBPath = locationsPath.replace(
        ORG_A.organizationId,
        ORG_B.organizationId,
      );
      const fixture = new DashboardApiFixture({
        companyOrganizations: [ORG_A, ORG_B],
        companyLocations: {
          [ORG_A.organizationId]: [LOCATION_A],
          [ORG_B.organizationId]: [LOCATION_B],
        },
        override: async (path, request) => {
          const oldList =
            path === locationsPath &&
            new URL(request.url()).searchParams.get("cursor") ===
              "deferred_cursor";
          if (oldList || path === lifecyclePath) {
            held = true;
            await pending;
            returned = true;
            return oldList
              ? {
                  body: {
                    items: [
                      { ...LOCATION_A, name: "Stale organization sentinel" },
                    ],
                    nextCursor: null,
                  },
                }
              : {
                  status: 403,
                  body: {
                    code: "MFA_STEP_UP_REQUIRED",
                    message: "Stale challenge sentinel",
                    requestId: "stale-scope",
                  },
                };
          }
          if (path === locationsPath)
            return {
              body: { items: [LOCATION_A], nextCursor: "deferred_cursor" },
            };
          if (path === orgBPath)
            return { body: { items: [LOCATION_B], nextCursor: null } };
          return undefined;
        },
      });
      await fixture.install(page);
      await enterLocations(page);
      const master = page.getByTestId("location-master");
      if (pendingKind === "list")
        await master.getByRole("button", { name: "Next", exact: true }).click();
      else await master.getByRole("button", { name: /Main Garage/ }).click();
      await expect.poll(() => held).toBe(true);
      if (replacement === "session") {
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Sign in", exact: true }),
        ).toBeVisible();
        release();
        await expect.poll(() => returned).toBe(true);
        await expect(page.getByTestId("location-detail")).toHaveCount(0);
        await signInOnCurrentPage(page, "replacement@example.com");
      } else
        await page
          .getByRole("button", { name: "Change scope", exact: true })
          .click();
      await page.getByRole("button", { name: ORG_B.name }).click();
      await page
        .getByRole("button", { name: "All Locations", exact: true })
        .click();
      await expect(
        master.getByRole("button", { name: /North Garage/ }),
      ).toBeVisible();
      release();
      await expect.poll(() => returned).toBe(true);
      // Drain queued browser rendering after the deferred handler has returned.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(
        page.getByText(/Stale organization sentinel|Stale challenge sentinel/),
      ).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByText("Select a Location to view this information."),
      ).toBeVisible();
      await expect(
        master.getByRole("button", { name: "Previous", exact: true }),
      ).toBeDisabled();
    });
  }
}
