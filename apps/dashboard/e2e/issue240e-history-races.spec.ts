import { expect, test } from "@playwright/test";
import { DashboardApiFixture, ORG_A } from "./support/dashboard-api-fixture";
import { deferred } from "./support/staff-directory-ui";
import {
  enterHistory,
  failure,
  historyPath,
  historyRow,
} from "./support/issue240e-history";
const path = historyPath();
const fresh = historyRow({
  identity: {
    firstName: "Fresh",
    lastName: "Person",
    email: "fresh@example.com",
  },
});
const stale = historyRow({
  identity: {
    firstName: "Stale",
    lastName: "Person",
    email: "stale@example.com",
  },
});
for (const mode of ["success", "failure"] as const) {
  for (const kind of [
    "filter-ABA",
    "page2",
    "detail",
    "employee-selector",
  ] as const) {
    test(`history ${kind} fences stale ${mode} without restoring PII/cursors/error/loading`, async ({
      page,
    }) => {
      const started = deferred(),
        release = deferred();
      let activeCalls = 0,
        detailCalls = 0,
        candidateCalls = 0;
      const fixture = new DashboardApiFixture({
        companyOrganizations: [ORG_A],
        override: async (route, request) => {
          const q = new URL(request.url()).searchParams;
          const pending =
            (route === path &&
              (kind === "page2"
                ? q.has("cursor")
                : kind === "filter-ABA" &&
                  q.get("status") === "ACTIVE" &&
                  ++activeCalls === 1)) ||
            (route === `${path}/${fresh.shiftId}` &&
              kind === "detail" &&
              ++detailCalls === 1) ||
            (route === `${path}/employees` &&
              kind === "employee-selector" &&
              ++candidateCalls === 1);
          if (pending) {
            started.resolve();
            await release.promise;
            if (mode === "failure") return failure();
            return {
              body:
                kind === "detail"
                  ? stale
                  : {
                      items: [
                        kind === "employee-selector"
                          ? {
                              membershipId: stale.membershipId,
                              identity: stale.identity,
                            }
                          : stale,
                      ],
                      nextCursor: "STALE_NEXT_CURSOR",
                    },
            };
          }
          if (route === path)
            return {
              body: {
                items: [fresh],
                nextCursor:
                  kind === "page2" && !q.has("status")
                    ? "PAGE_TWO_CURSOR"
                    : null,
              },
            };
          if (route === `${path}/${fresh.shiftId}`) return { body: fresh };
          if (route === `${path}/employees`)
            return {
              body: {
                items: [
                  {
                    membershipId: fresh.membershipId,
                    identity: fresh.identity,
                  },
                ],
                nextCursor: null,
              },
            };
          return undefined;
        },
      });
      await fixture.install(page);
      await enterHistory(page);
      await expect(page.getByRole("table")).toContainText("Fresh Person");
      const status = page.getByRole("combobox", {
        name: "Status",
        exact: true,
      });
      if (kind === "filter-ABA") await status.selectOption("ACTIVE");
      if (kind === "page2")
        await page.getByRole("button", { name: "Next", exact: true }).click();
      if (kind === "detail")
        await page.getByRole("table").getByRole("button").first().click();
      if (kind === "employee-selector")
        await page
          .getByRole("combobox", { name: "Employee", exact: true })
          .focus();
      await started.promise;
      await status.selectOption("ENDED");
      await expect(page.getByRole("table")).toContainText("Fresh Person");
      if (kind === "filter-ABA") {
        await status.selectOption("ACTIVE");
        await expect(page.getByRole("table")).toContainText("Fresh Person");
      }
      if (kind === "detail") {
        await page.getByRole("table").getByRole("button").first().click();
        await expect(page.getByRole("dialog")).toContainText("Fresh Person");
      }
      if (kind === "employee-selector") {
        await page
          .getByRole("combobox", { name: "Employee", exact: true })
          .focus();
        await expect(
          page.getByRole("option", { name: /Fresh Person/ }),
        ).toHaveCount(1);
      }
      release.resolve();
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("table")).toContainText("Fresh Person");
      await expect(
        page.getByText("stale@example.com", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("stale history failure", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("option", { name: /Stale Person/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Previous", exact: true }),
      ).toHaveCount(0);
      expect(fixture.count(path)).toBe(
        kind === "filter-ABA" ? 4 : kind === "page2" ? 3 : 2,
      );
      if (kind === "detail") {
        expect(fixture.count(`${path}/${fresh.shiftId}`)).toBe(2);
        await expect(page.getByRole("dialog")).toContainText("Fresh Person");
      }
    });
  }
}
test("authoritative denial clears rows, detail and employee selector identity", async ({
  page,
}) => {
  let deny = false;
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (route) => {
      if (route === path)
        return deny
          ? {
              status: 404,
              body: {
                code: "AUTHORIZATION_DENIED",
                message: "Access denied",
                requestId: "history-denied",
              },
            }
          : { body: { items: [fresh], nextCursor: null } };
      if (route === `${path}/${fresh.shiftId}`) return { body: fresh };
      if (route === `${path}/employees`)
        return {
          body: {
            items: [
              { membershipId: fresh.membershipId, identity: fresh.identity },
            ],
            nextCursor: null,
          },
        };
      return undefined;
    },
  });
  await fixture.install(page);
  await enterHistory(page);
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("combobox", { name: "Employee", exact: true }).focus();
  await expect(page.getByRole("option", { name: /Fresh Person/ })).toHaveCount(
    1,
  );
  await page.getByRole("table").getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toContainText("Fresh Person");
  await page.keyboard.press("Escape");
  deny = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Access denied" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Fresh Person", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Fresh Person/ })).toHaveCount(
    0,
  );
});
