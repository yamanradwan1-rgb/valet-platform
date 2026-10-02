import { expect, test } from "@playwright/test";
import {
  LOCATION_A,
  LOCATION_B,
  ORG_A,
  ORG_B,
} from "./support/dashboard-api-fixture";
import {
  forceFixture,
  FORCE_BASE,
  SHIFT_Y,
  openForceEnd,
  fillForceEnd,
  enterForceHistory,
  forceResult,
  errorReply,
} from "./support/issue240g-force-end";
import { historyRow } from "./support/issue240e-history";
import { deferred } from "./support/staff-directory-ui";
import { switchOrganization } from "./support/issue240d-onboarding";

for (const outcome of ["success", "failure"] as const) {
  for (const change of [
    "organization-ABA",
    "location-ABA",
    "target",
    "filter",
    "refresh",
    "logout",
    "session",
  ] as const) {
    test(`${change} discards delayed Force End ${outcome}, including old finally/reconcile`, async ({
      page,
    }) => {
      const started = deferred(),
        release = deferred();
      let historyReads = 0;
      const setup = forceFixture({
        extraScope: true,
        rows: [historyRow(), historyRow({ shiftId: SHIFT_Y })],
        onRead: (path) => {
          if (
            path === FORCE_BASE &&
            ++historyReads === 2 &&
            change === "session"
          )
            return errorReply("STAFF_AUTHENTICATION_REQUIRED", 401);
          return undefined;
        },
        onPost: async (body) => {
          started.resolve();
          await release.promise;
          return outcome === "success"
            ? { body: forceResult(body) }
            : errorReply("OPEN_TASK_HANDOFF_REQUIRED");
        },
      });
      await setup.install(page);
      await enterForceHistory(page);
      await openForceEnd(page);
      const old = await fillForceEnd(page, "Old intent reason");
      await old
        .getByRole("button", { name: "Force End Shift", exact: true })
        .click();
      await started.promise;
      if (change === "organization-ABA") {
        await switchOrganization(page, ORG_B, LOCATION_B);
        await page.getByRole("button", { name: "Shifts", exact: true }).click();
        await switchOrganization(page, ORG_A, LOCATION_A);
        await page.getByRole("button", { name: "Shifts", exact: true }).click();
      } else if (change === "location-ABA") {
        for (const location of [LOCATION_B, LOCATION_A]) {
          await page
            .getByRole("button", { name: "Change scope", exact: true })
            .evaluate((button: HTMLButtonElement) => button.click());
          await page
            .getByRole("option", { name: location.name, exact: true })
            .evaluate((button: HTMLButtonElement) => button.click());
          await page
            .getByRole("button", { name: "Shifts", exact: true })
            .click();
          await expect(page.getByRole("table")).toBeVisible();
        }
      } else if (change === "target") {
        await page
          .getByRole("table")
          .getByRole("button")
          .nth(1)
          .evaluate((button: HTMLButtonElement) => button.click());
      } else if (change === "filter") {
        await page
          .getByRole("combobox", { name: "Status", exact: true })
          .selectOption("ACTIVE");
      } else if (change === "logout") {
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .evaluate((button: HTMLButtonElement) => button.click());
        await expect(
          page.getByRole("heading", { name: "Sign in" }),
        ).toBeVisible();
      } else {
        await page
          .getByRole("button", { name: "Refresh", exact: true })
          .evaluate((button: HTMLButtonElement) => button.click());
        if (change === "session") {
          await expect
            .poll(() => setup.fixture.count("/v1/staff/auth/refresh"))
            .toBe(1);
          await page
            .getByRole("button", { name: "Shifts", exact: true })
            .click();
        }
      }
      if (change !== "logout") {
        await expect(page.getByRole("table")).toBeVisible();
        if (change === "target") {
          await page
            .getByRole("dialog", { name: "Shift details", exact: true })
            .getByRole("button", { name: "Force End Shift", exact: true })
            .click();
        } else await openForceEnd(page);
        const current = await fillForceEnd(page, "New explicit intent");
        const listBefore = setup.fixture.count(FORCE_BASE);
        release.resolve();
        await page.waitForLoadState("networkidle");
        await expect(current.getByLabel("Reason", { exact: true })).toHaveValue(
          "New explicit intent",
        );
        await expect(
          current.getByRole("button", { name: "Force End Shift", exact: true }),
        ).toBeEnabled();
        await expect(current.getByRole("status")).toHaveCount(0);
        expect(setup.fixture.count(FORCE_BASE)).toBe(listBefore);
      } else {
        release.resolve();
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(
          page.getByText("maya@example.com", { exact: true }),
        ).toHaveCount(0);
      }
      expect(setup.posts).toHaveLength(1);
      await expect(
        page.getByText("Old intent reason", { exact: true }),
      ).toHaveCount(0);
    });
  }
}
