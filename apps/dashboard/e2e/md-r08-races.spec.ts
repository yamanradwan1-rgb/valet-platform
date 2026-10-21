import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { incidentItem, keyItem } from "./support/operations-fixtures";
import { r08Path } from "./support/r08-accountability";
import { md04FeatureAuthority, orgAuditPath } from "./support/md04-fixtures";
import {
  organizationEvents,
  supervisorEvent,
} from "./support/md04-audit-fixtures";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function select(page: Page, name: string) {
  await page.getByRole("button", { name: ORG_A.name }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
const row = (family: "keys" | "incidents", label: string) =>
  family === "keys"
    ? { ...keyItem(), code: label }
    : { ...incidentItem(), description: label };

for (const family of ["keys", "incidents"] as const) {
  for (const outcome of ["success", "failure"] as const) {
    test(`${family} A→B→A rejects stale first-A ${outcome}`, async ({
      page,
    }) => {
      const started = deferred();
      const release = deferred();
      const delivered = deferred();
      let aCalls = 0;
      const fixture = new DashboardApiFixture({
        companyOrganizations: [ORG_A],
        companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
        override: async (path) => {
          if (path === r08Path(family)) {
            if (++aCalls === 1) {
              started.resolve();
              await release.promise;
              delivered.resolve();
              return outcome === "failure"
                ? {
                    status: 503,
                    body: {
                      code: "TEMPORARY",
                      message: "STALE_R08_FAILURE",
                      requestId: "r08-stale",
                    },
                  }
                : {
                    body: {
                      items: [row(family, "STALE_R08_SUCCESS")],
                      nextCursor: null,
                    },
                  };
            }
            return {
              body: { items: [row(family, "CURRENT_A")], nextCursor: null },
            };
          }
          if (path === r08Path(family, LOCATION_B.locationId))
            return {
              body: { items: [row(family, "CURRENT_B")], nextCursor: null },
            };
          return undefined;
        },
      });
      await fixture.install(page);
      await page.goto(`/${family}`);
      await signInOnCurrentPage(page);
      await select(page, LOCATION_A.name);
      await started.promise;
      await page
        .getByRole("button", { name: "Change scope", exact: true })
        .click();
      await page.getByRole("option", { name: LOCATION_B.name }).click();
      await expect(page.getByRole("table")).toContainText("CURRENT_B");
      await page
        .getByRole("button", { name: "Change scope", exact: true })
        .click();
      await page.getByRole("option", { name: LOCATION_A.name }).click();
      await expect(page.getByRole("table")).toContainText("CURRENT_A");
      release.resolve();
      await delivered.promise;
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("table")).toContainText("CURRENT_A");
      await expect(page.locator("body")).not.toContainText("STALE_R08");
    });
  }

  test(`${family} next/previous stay opaque and cursor never crosses Location`, async ({
    page,
  }) => {
    const seen: Array<[string, string | null]> = [];
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A, LOCATION_B] },
      override: (path, request) => {
        if (!path.endsWith(`/overview/${family}`)) return undefined;
        const cursor = new URL(request.url()).searchParams.get("cursor");
        seen.push([path, cursor]);
        return {
          body: {
            items: [row(family, cursor ? "SECOND_PAGE" : "FIRST_PAGE")],
            nextCursor: cursor ? null : "r08next1",
          },
        };
      },
    });
    await fixture.install(page);
    await page.goto(`/${family}`);
    await signInOnCurrentPage(page);
    await select(page, LOCATION_A.name);
    await expect(page.getByRole("table")).toContainText("FIRST_PAGE");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("SECOND_PAGE");
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("FIRST_PAGE");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("SECOND_PAGE");
    await page
      .getByRole("button", { name: "Change scope", exact: true })
      .click();
    await select(page, LOCATION_B.name);
    await expect(page.getByRole("table")).toContainText("FIRST_PAGE");
    expect(seen.some(([, cursor]) => cursor === "r08next1")).toBe(true);
    expect(
      seen
        .filter(([path]) => path === r08Path(family, LOCATION_B.locationId))
        .every(([, cursor]) => cursor === null),
    ).toBe(true);
  });
}

for (const route of ["keys", "incidents", "audit-log"] as const) {
  test(`${route} pending read cannot repaint after logout`, async ({
    page,
  }) => {
    const started = deferred();
    const release = deferred();
    const delivered = deferred();
    const fixture = new DashboardApiFixture({
      companyOrganizations: [ORG_A],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: async (path, request) => {
        if (path === "/v1/staff/dashboard/feature-authority")
          return md04FeatureAuthority(request, "CA");
        if (path !== (route === "audit-log" ? orgAuditPath : r08Path(route)))
          return undefined;
        started.resolve();
        await release.promise;
        delivered.resolve();
        return {
          body: {
            items:
              route === "audit-log"
                ? organizationEvents()
                : [row(route, "PENDING_R08")],
            nextCursor: null,
          },
        };
      },
    });
    await fixture.install(page);
    await page.goto(`/${route}`);
    await signInOnCurrentPage(page);
    await select(
      page,
      route === "audit-log" ? "All Locations" : LOCATION_A.name,
    );
    await started.promise;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    release.resolve();
    await delivered.promise;
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("PENDING_R08");
  });
}

test("Audit filter fences a deferred old success and sends canonical values", async ({
  page,
}) => {
  const started = deferred();
  const release = deferred();
  const delivered = deferred();
  const queries: URLSearchParams[] = [];
  const fixture = new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: async (path, request) => {
      if (path === "/v1/staff/dashboard/feature-authority")
        return md04FeatureAuthority(request, "CA");
      if (path !== orgAuditPath) return undefined;
      const query = new URL(request.url()).searchParams;
      queries.push(query);
      if (query.get("eventType") === "LOCATION_CONFIGURATION_OVERRIDE_SET") {
        started.resolve();
        await release.promise;
        delivered.resolve();
        return { body: { items: [organizationEvents()[2]], nextCursor: null } };
      }
      return {
        body: {
          items: [supervisorEvent(LOCATION_A.locationId)],
          nextCursor: "r08next1",
        },
      };
    },
  });
  await fixture.install(page);
  await page.goto("/audit-log");
  await signInOnCurrentPage(page);
  await select(page, "All Locations");
  await expect(page.getByRole("table")).toContainText("Vehicle parked");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => queries.some((q) => q.has("cursor"))).toBe(true);
  await page
    .getByLabel("Event type")
    .selectOption({ label: "Location configuration override set" });
  await started.promise;
  await page.getByLabel("Event type").selectOption({ label: "Vehicle parked" });
  await expect(page.getByRole("table")).toContainText("Vehicle parked");
  release.resolve();
  await delivered.promise;
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("table")).not.toContainText(
    "Location configuration override set",
  );
  expect(queries.at(-1)?.get("eventType")).toBe("VALET_SESSION_PARKED");
  expect(queries.at(-1)?.has("cursor")).toBe(false);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
});
