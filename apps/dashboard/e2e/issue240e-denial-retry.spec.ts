import { expect, test } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { deferred } from "./support/staff-directory-ui";
import {
  enterHistory,
  historyPath,
  historyRow,
} from "./support/issue240e-history";

test("selected employee identity stays cleared during denied history retry and empty success", async ({
  page,
}) => {
  const row = historyRow();
  const path = historyPath();
  const started = deferred(),
    release = deferred();
  let phase = "initial";
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: async (route) => {
      if (route === `${path}/employees`)
        return {
          body: {
            items: [{ membershipId: row.membershipId, identity: row.identity }],
            nextCursor: null,
          },
        };
      if (route !== path) return undefined;
      if (phase === "denied")
        return {
          status: 404,
          body: {
            code: "AUTHORIZATION_DENIED",
            message: "Access denied",
            requestId: "denied-retry",
          },
        };
      if (phase === "retry") {
        started.resolve();
        await release.promise;
        return { body: { items: [], nextCursor: null } };
      }
      return { body: { items: [row], nextCursor: null } };
    },
  });
  await fixture.install(page);
  await enterHistory(page);
  const employee = page.getByRole("combobox", {
    name: "Employee",
    exact: true,
  });
  await employee.focus();
  await employee.selectOption(row.membershipId);
  await expect(page.getByRole("table")).toContainText(row.identity.email);
  phase = "denied";
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Access denied" }),
  ).toBeVisible();
  phase = "retry";
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await started.promise;
  try {
    await expect(
      page.getByRole("option", { name: new RegExp(row.identity.email) }),
    ).toHaveCount(0);
    await expect(employee).toHaveValue(row.membershipId);
  } finally {
    release.resolve();
  }
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("option", { name: new RegExp(row.identity.email) }),
  ).toHaveCount(0);
  await expect(employee).toHaveValue(row.membershipId);
  expect(fixture.count(path)).toBe(4);
});

for (const kind of ["Employee", "Location"] as const) {
  test(`${kind} candidate denial retry cannot restore a cached label after empty success`, async ({
    page,
  }) => {
    const row = historyRow();
    const path = historyPath();
    const selectorPath =
      kind === "Employee"
        ? `${path}/employees`
        : `/v1/staff/management/organizations/${ORG_A.organizationId}/locations`;
    const id = kind === "Employee" ? row.membershipId : LOCATION_A.locationId;
    const label = kind === "Employee" ? row.identity.email : LOCATION_A.name;
    const started = deferred(),
      release = deferred();
    let phase = "initial";
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: async (route) => {
        if (route === path) return { body: { items: [row], nextCursor: null } };
        if (route !== selectorPath) return undefined;
        if (phase === "denied")
          return {
            status: 404,
            body: {
              code: "AUTHORIZATION_DENIED",
              message: "Access denied",
              requestId: "selector-denied",
            },
          };
        if (phase === "retry") {
          started.resolve();
          await release.promise;
          return { body: { items: [], nextCursor: null } };
        }
        return {
          body: {
            items:
              kind === "Employee"
                ? [{ membershipId: row.membershipId, identity: row.identity }]
                : [LOCATION_A],
            nextCursor: null,
          },
        };
      },
    });
    await fixture.install(page);
    await enterHistory(page);
    const selector = page.getByRole("combobox", { name: kind, exact: true });
    await selector.focus();
    await selector.selectOption(id);
    await expect(page.getByRole("table")).toBeVisible();
    phase = "denied";
    await selector.focus();
    await expect(
      selector.getByRole("option", { name: "Retry", exact: true }),
    ).toHaveCount(1);
    await expect(
      selector.getByRole("option", { name: new RegExp(label) }),
    ).toHaveCount(0);
    phase = "retry";
    await selector.selectOption("RETRY");
    await started.promise;
    try {
      await expect(
        selector.getByRole("option", { name: new RegExp(label) }),
      ).toHaveCount(0);
    } finally {
      release.resolve();
    }
    await expect(
      selector.getByRole("option", { name: "Loading…", exact: true }),
    ).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await expect(
      selector.getByRole("option", { name: new RegExp(label) }),
    ).toHaveCount(0);
    await expect(selector).toHaveValue(id);
  });
}
