import { expect, test, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  LOCATION_B,
  ORG_A,
} from "./support/dashboard-api-fixture";
import { signInOnCurrentPage } from "./support/foundation-ui";
import { deferred } from "./support/staff-directory-ui";
import {
  enterHistory,
  historyPath,
  historyRow,
} from "./support/issue240e-history";

const path = historyPath();
const discovery = `/v1/staff/dashboard/organizations/${ORG_A.organizationId}/locations`;
const inactive = { ...LOCATION_B, status: "INACTIVE" as const };
const current = { ...LOCATION_B, name: "Current authorized C" };
const denied = {
  status: 404,
  body: {
    code: "AUTHORIZATION_DENIED",
    message: "Access denied",
    requestId: "location-recovery",
  },
};
function rowAt(
  location: {
    locationId: string;
    name: string;
    code: string;
    timezone: string;
  },
  recovered = false,
) {
  const { locationId, name, code, timezone } = location;
  return historyRow({
    location: { locationId, name, code, timezone },
    identity: recovered
      ? {
          firstName: "Recovered",
          lastName: "Employee",
          email: "recovered@example.com",
        }
      : historyRow().identity,
  });
}
async function enterManager(page: Page) {
  await page.goto("/employees");
  await signInOnCurrentPage(page, "manager@example.com");
  await page.getByRole("button", { name: ORG_A.name, exact: true }).click();
  await page
    .getByRole("button", { name: LOCATION_A.name, exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
}

for (const role of ["LM", "CA"] as const) {
  test(`${role} history discovery preserves its own inactive Location boundary and explicit pages`, async ({
    page,
  }) => {
    const queries: URLSearchParams[] = [];
    const selectorPath =
      role === "LM"
        ? discovery
        : discovery.replace("/dashboard/", "/management/");
    const fixture = new DashboardApiFixture({
      companyOrganizations: role === "CA" ? [ORG_A] : [],
      locationManagerOrganizations: role === "LM" ? [ORG_A] : [],
      companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
      override: (route, request) => {
        const q = new URL(request.url()).searchParams;
        if (route === path) {
          queries.push(q);
          return {
            body: {
              items: [
                rowAt(
                  q.get("locationId") === inactive.locationId
                    ? inactive
                    : LOCATION_A,
                ),
              ],
              nextCursor: null,
            },
          };
        }
        if (route === selectorPath && request.url().includes("limit=50"))
          return {
            body: {
              items: q.has("cursor") ? [current] : [LOCATION_A, inactive],
              nextCursor: q.has("cursor") ? null : "LOCATION_PAGE_TWO",
            },
          };
        return undefined;
      },
    });
    await fixture.install(page);
    if (role === "LM") await enterManager(page);
    else await enterHistory(page);
    const selector = page.getByRole("combobox", {
      name: "Location",
      exact: true,
    });
    const initialDiscovery = fixture.count(selectorPath);
    await selector.focus();
    await expect(
      selector.getByRole("option", { name: new RegExp(LOCATION_A.name) }),
    ).toHaveCount(1);
    await expect(
      selector.locator(`option[value="${inactive.locationId}"]`),
    ).toHaveCount(role === "LM" ? 0 : 1);
    await expect(
      selector.getByRole("option", {
        name: "All authorized locations",
        exact: true,
      }),
    ).toHaveCount(1);
    expect(fixture.count(selectorPath)).toBe(initialDiscovery + 1);
    expect(queries).toHaveLength(1);
    expect(
      queries.some((q) => q.get("locationId") === inactive.locationId),
    ).toBe(false);
    await selector.selectOption("NEXT");
    await expect(
      selector.getByRole("option", { name: /Current authorized C/ }),
    ).toHaveCount(1);
    expect(fixture.count(selectorPath)).toBe(initialDiscovery + 2);
    await selector.selectOption("PREVIOUS");
    await expect(
      selector.getByRole("option", { name: new RegExp(LOCATION_A.name) }),
    ).toHaveCount(1);
    expect(fixture.count(selectorPath)).toBe(initialDiscovery + 3);
    expect(queries).toHaveLength(1);
    if (role === "CA") {
      await selector.selectOption(inactive.locationId);
      await expect.poll(() => queries.length).toBe(2);
      expect(queries[1]!.get("locationId")).toBe(inactive.locationId);
    }
  });
}

for (const recovery of ["ALL", "C"] as const) {
  for (const stale of ["success", "failure"] as const) {
    test(`LM denied Location recovers to ${recovery} and fences pre-denial discovery ${stale}`, async ({
      page,
    }) => {
      const started = deferred(),
        release = deferred();
      const queries: URLSearchParams[] = [];
      let phase = "initial",
        historyForA = 0;
      const fixture = new DashboardApiFixture({
        locationManagerOrganizations: [ORG_A],
        locationManagerLocations: { [ORG_A.organizationId]: [LOCATION_A] },
        override: async (route, request) => {
          const q = new URL(request.url()).searchParams;
          if (route === path) {
            queries.push(q);
            if (
              q.get("locationId") === LOCATION_A.locationId &&
              ++historyForA > 1
            ) {
              await started.promise;
              phase = "denied";
              return denied;
            }
            return {
              body: {
                items: [
                  rowAt(
                    phase === "initial" ? LOCATION_A : current,
                    phase !== "initial",
                  ),
                ],
                nextCursor: null,
              },
            };
          }
          if (route === discovery && q.get("limit") === "50") {
            if (phase === "refresh") {
              started.resolve();
              await release.promise;
              return stale === "success"
                ? {
                    body: {
                      items: [LOCATION_A],
                      nextCursor: "STALE_LOCATION_CURSOR",
                    },
                  }
                : {
                    status: 503,
                    body: {
                      code: "TEMPORARY",
                      message: "Stale discovery failure",
                      requestId: "stale-discovery",
                    },
                  };
            }
            return {
              body: {
                items: phase === "initial" ? [LOCATION_A] : [current],
                nextCursor: null,
              },
            };
          }
          return undefined;
        },
      });
      await fixture.install(page);
      await enterManager(page);
      const selector = page.getByRole("combobox", {
        name: "Location",
        exact: true,
      });
      await selector.focus();
      await selector.selectOption(LOCATION_A.locationId);
      await expect(page.getByRole("table")).toBeVisible();
      expect(queries).toHaveLength(2);
      const discoveryBefore = fixture.count(discovery);
      phase = "refresh";
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await selector.focus();
      await started.promise;
      try {
        await expect(
          page.getByRole("alert").filter({ hasText: "Access denied" }),
        ).toBeVisible();
        await expect(selector).toBeVisible();
        await expect(selector).toHaveValue(LOCATION_A.locationId);
        await expect(
          selector.getByRole("option", { name: new RegExp(LOCATION_A.name) }),
        ).toHaveCount(0);
        await expect(
          selector.getByRole("option", {
            name: "Selected location",
            exact: true,
          }),
        ).toHaveCount(1);
        await expect(
          page.getByRole("combobox", { name: "Employee", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByText("maya@example.com", { exact: true }),
        ).toHaveCount(0);
        expect(queries).toHaveLength(3);
        await selector.focus();
        await expect(
          selector.getByRole("option", { name: /Current authorized C/ }),
        ).toHaveCount(1);
        expect(fixture.count(discovery)).toBe(discoveryBefore + 2);
        await selector.selectOption(
          recovery === "ALL" ? "ALL" : current.locationId,
        );
        await expect(page.getByRole("table")).toContainText(
          "Recovered Employee",
        );
        expect(queries).toHaveLength(4);
        expect(queries[3]!.get("locationId")).toBe(
          recovery === "ALL" ? null : current.locationId,
        );
      } finally {
        release.resolve();
      }
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("table")).toContainText("Recovered Employee");
      await expect(
        selector.getByRole("option", { name: new RegExp(LOCATION_A.name) }),
      ).toHaveCount(0);
      await expect(
        selector.getByRole("option", { name: "Next", exact: true }),
      ).toHaveCount(0);
      await expect(
        selector.getByRole("option", { name: "Retry", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("maya@example.com", { exact: true }),
      ).toHaveCount(0);
      expect(queries).toHaveLength(4);
      expect(fixture.count(discovery)).toBe(discoveryBefore + 2);
    });
  }
}
