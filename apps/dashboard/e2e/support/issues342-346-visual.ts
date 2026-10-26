import { expect, type Page } from "@playwright/test";
import {
  DashboardApiFixture,
  LOCATION_A,
  ORG_A,
} from "./dashboard-api-fixture";
import { PresenceFixture, ZONE_ID } from "./presence-fixtures";
import { mockPresenceMap } from "./presence-map-mock";
import {
  enterLocations,
  lifecyclePath,
  locationLifecycle,
  selectLocation,
} from "./r06-locations";
import { enterHistory, historyPath, historyRow } from "./issue240e-history";

export async function visualLocation(page: Page) {
  await new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    companyLocations: { [ORG_A.organizationId]: [LOCATION_A] },
    override: (path) =>
      path === lifecyclePath
        ? {
            body: locationLifecycle({
              status: "ACTIVE",
              drain: {
                blocked: true,
                activeShiftPresent: true,
                nonCompletedValetSessionPresent: false,
                nonTerminalTaskPresent: false,
              },
            }),
          }
        : undefined,
  }).install(page);
  await enterLocations(page);
  await selectLocation(page);
}

export async function visualCash(page: Page, baseline: boolean) {
  const row = historyRow({
    status: "ENDED",
    endedAt: "2026-10-02T07:00:00.000Z",
  });
  const path = historyPath();
  await new DashboardApiFixture({
    companyOrganizations: [ORG_A],
    override: (route) => {
      if (route === path) return { body: { items: [row], nextCursor: null } };
      if (route === `${path}/${row.shiftId}`)
        return {
          body: {
            ...row,
            ...(baseline
              ? {}
              : {
                  cashReconciliation: {
                    state: "REPORTED",
                    snapshot: {
                      cashExpected: "10.001",
                      cashReported: "12.345",
                      cashVariance: "2.344",
                      currency: "JOD",
                      reportedAt: "2026-10-02T07:00:00.000Z",
                      reportedBy: "Synthetic reporter",
                    },
                  },
                }),
          },
        };
      return undefined;
    },
  }).install(page);
  await enterHistory(page);
  await page.getByRole("table").getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toContainText("Maya");
}

export async function visualPresence(page: Page) {
  await mockPresenceMap(page);
  const f = new PresenceFixture("LM", (path, request) =>
    path.endsWith(`/zones/${ZONE_ID}`) && request.method() === "PUT"
      ? {
          status: 409,
          body: {
            code: "PRESENCE_NOT_READY",
            message: "Rejected",
            requestId: "synthetic-344",
          },
        }
      : undefined,
  );
  f.policy.overrides.endModeOverride = "REQUIRE_OR_OVERRIDE";
  f.policy.effective.endMode = "REQUIRE_OR_OVERRIDE";
  f.policy.readiness.applicability = "STRICT";
  await f.open(page);
  await page
    .getByTestId("presence-zones")
    .getByRole("button", { name: "Disable", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Disable", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("alert").first(),
  ).toBeVisible();
}

export async function setVisualPreferences(
  page: Page,
  locale: "en" | "ar",
  theme: "light" | "dark",
  zoom: number,
) {
  await page.evaluate(
    ({ locale, theme, zoom }) => {
      localStorage.setItem("vaylet_dashboard_locale", locale);
      localStorage.setItem("vaylet_dashboard_theme", theme);
      window.dispatchEvent(new Event("vaylet-dashboard-locale-change"));
      window.dispatchEvent(new Event("vaylet-dashboard-theme-change"));
      document.documentElement.style.zoom = String(zoom);
    },
    { locale, theme, zoom },
  );
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    locale === "ar" ? "rtl" : "ltr",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await page.evaluate(() => document.fonts.ready);
  // Native focus scrolling depends on the approved new content height. Compare
  // layout at the same scroll origin instead of mistaking scroll for redesign.
  await page.locator("h1").evaluate((node) => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      parent.scrollTop = 0;
      parent.scrollLeft = 0;
    }
    window.scrollTo(0, 0);
  });
}

export function frozenGeometry(page: Page) {
  return page.evaluate(() =>
    [".sidebar", ".topbar", "h1", "[role=tablist]"].flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (node) => {
          const rect = node.getBoundingClientRect(),
            style = getComputedStyle(node);
          return {
            selector,
            box: [rect.x, rect.y, rect.width, rect.height],
            style: [
              style.fontFamily,
              style.fontSize,
              style.color,
              style.backgroundColor,
              style.padding,
              style.borderRadius,
              style.gap,
              style.direction,
            ],
          };
        },
      ),
    ),
  );
}
